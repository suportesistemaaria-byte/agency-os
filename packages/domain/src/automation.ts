import { and, eq, inArray, ne } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import type { CommandKit } from '@aos/core';
import type { ClaimedEvent } from '@aos/events';
import { childLogger } from '@aos/logger';
import { command, systemCtx } from './context';
import { dueFromPolicy } from './sla-clock';
import { createTaskIn } from './tasks';
import { generateInvoicesIn } from './finance';
import { membersWithRole, notifyIn } from './notifications';

const log = childLogger({ module: 'automation' });

/** Regras iniciais (V3, seção 9; handoff, Bloco 12). Pré-cadastradas por workspace e ativáveis. */
export const DEFAULT_RULES = [
  {
    key: 'proposal_followups',
    name: 'Proposta enviada → follow-ups D+2, D+5 e D+10',
    trigger: 'proposal.sent',
    actions: [{ type: 'create_followups', days: [2, 5, 10] }],
  },
  {
    key: 'change_request_task',
    name: 'Alteração pedida → tarefa com SLA de Alteração para o responsável padrão',
    trigger: 'content.change_requested',
    actions: [{ type: 'create_change_task', function: 'design', policy: 'alteracao' }],
  },
  {
    key: 'contract_invoices',
    name: 'Contrato confirmado pelo Financeiro → gerar cobranças',
    trigger: 'contract.confirmed',
    actions: [{ type: 'generate_invoices' }],
  },
  {
    key: 'task_assigned_notify',
    name: 'Tarefa atribuída → avisar responsável',
    trigger: 'task.assigned',
    actions: [{ type: 'notify_assignee' }],
  },
  {
    key: 'invoice_overdue_notify',
    name: 'Cobrança atrasada → avisar Financeiro e marcar Health score',
    trigger: 'invoice.overdue',
    actions: [{ type: 'notify_finance' }],
  },
  {
    key: 'request_created_triage',
    name: 'Solicitação recebida → avisar Atendimento para triagem (SLA 2h úteis)',
    trigger: 'request.created',
    actions: [{ type: 'notify_triage' }],
  },
  {
    key: 'contract_expiring_renewal',
    name: 'Contrato vencendo (90 dias, sem renovação) → oportunidade de renovação e aviso',
    trigger: 'contract.expiring',
    actions: [{ type: 'create_renewal', withinDays: 90 }, { type: 'notify_owner' }],
  },
  {
    key: 'sla_alerts',
    name: 'SLA próximo/atrasado → avisar responsável',
    trigger: 'sla.near_due|sla.overdue',
    actions: [{ type: 'notify_sla' }],
  },
  {
    key: 'opportunity_won_notify',
    name: 'Oportunidade ganha → sugerir "Transformar em cliente" e avisar Gestor',
    trigger: 'opportunity.won',
    actions: [{ type: 'notify_won' }],
  },
  {
    key: 'content_submitted_notify',
    name: 'Conteúdo enviado ao cliente → avisar atendimento',
    trigger: 'content.submitted',
    actions: [{ type: 'notify_owner' }],
  },
] as const;

type Action = { type: string; [k: string]: unknown };
type Handler = (kit: CommandKit, ev: ClaimedEvent, action: Action) => Promise<Record<string, unknown>>;

const p = (ev: ClaimedEvent) => ev.payload as Record<string, string>;

const HANDLERS: Record<string, Handler> = {
  /** contract.expiring → oportunidade de renovação ligada ao cliente, uma por contrato (se ainda não houver). */
  async create_renewal(kit, ev, action) {
    const { tx, ctx } = kit;
    const pl = ev.payload as { contractId: string; clientId: string; daysLeft: number };
    if (pl.daysLeft > Number(action.withinDays ?? 90)) return { skipped: 'fora da janela' };
    const [contract] = await tx.select().from(s.contracts).where(eq(s.contracts.id, pl.contractId));
    if (!contract || contract.status !== 'active') return { skipped: 'contrato não vigente' };
    const open = await tx
      .select({ id: s.opportunities.id })
      .from(s.opportunities)
      .where(
        and(
          eq(s.opportunities.clientId, pl.clientId),
          eq(s.opportunities.type, 'renewal'),
          inArray(s.opportunities.state, ['open', 'no_response', 'paused', 'won']),
        ),
      );
    if (open.length) return { skipped: 'renovação já em andamento', opportunityId: open[0]!.id };
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, pl.clientId));
    const [pipe] = await tx.select().from(s.pipelines).where(eq(s.pipelines.isDefault, true));
    const [stage] = await tx
      .select()
      .from(s.pipelineStages)
      .where(eq(s.pipelineStages.pipelineId, pipe!.id))
      .orderBy(s.pipelineStages.position)
      .limit(1);
    const items = await tx.select().from(s.contractItems).where(eq(s.contractItems.contractId, contract.id));
    const mrr = items.filter((i) => i.kind === 'recurring').reduce((a, i) => a + i.amountCents, 0);
    const [opp] = await tx
      .insert(s.opportunities)
      .values({
        workspaceId: ctx.workspaceId,
        pipelineId: pipe!.id,
        stageId: stage!.id,
        organizationId: client!.organizationId,
        clientId: client!.id,
        type: 'renewal',
        ownerId: client!.ownerId,
        title: `Renovação · ${client!.name}`,
        mrrCents: mrr,
        source: 'Automação: contrato vencendo',
      })
      .returning();
    const due = await dueFromPolicy(
      tx,
      { model: 'business_days', amount: 2, rule: 'A1_same_time' },
      new Date(),
    );
    await tx.insert(s.nextActions).values({
      workspaceId: ctx.workspaceId,
      opportunityId: opp!.id,
      title: `Propor renovação (contrato vence em ${pl.daysLeft} dias)`,
      dueAt: due,
      ownerId: client!.ownerId,
      source: 'automation',
      idempotencyKey: `renewal:${ev.id}`,
    });
    await kit.emit({
      type: 'opportunity.created',
      entityType: 'opportunity',
      entityId: opp!.id,
      payload: { opportunityId: opp!.id },
    });
    return { opportunityId: opp!.id };
  },

  /** Follow-ups em dias úteis pelo @aos/sla, idempotentes por evento. */
  async create_followups(kit, ev, action) {
    const { tx, ctx } = kit;
    const [opp] = await tx
      .select()
      .from(s.opportunities)
      .where(eq(s.opportunities.id, p(ev).opportunityId!));
    if (!opp || opp.state !== 'open') return { skipped: 'oportunidade não está aberta' };
    const created: string[] = [];
    for (const d of action.days as number[]) {
      const due = await dueFromPolicy(
        tx,
        { model: 'business_days', amount: d, rule: 'A1_same_time' },
        new Date(ev.occurred_at),
      );
      const rows = await tx
        .insert(s.nextActions)
        .values({
          workspaceId: ctx.workspaceId,
          opportunityId: opp.id,
          title: `Follow-up D+${d} da proposta`,
          dueAt: due,
          ownerId: opp.ownerId,
          source: 'automation',
          idempotencyKey: `${ev.id}:D+${d}`,
        })
        .onConflictDoNothing()
        .returning({ id: s.nextActions.id });
      created.push(...rows.map((r) => r.id));
    }
    return { followups: created.length };
  },

  /** content.change_requested → tarefa para o responsável padrão da função, com SLA de Alteração. */
  async create_change_task(kit, ev, action) {
    const { tx } = kit;
    const [c] = await tx
      .select()
      .from(s.contents)
      .where(eq(s.contents.id, p(ev).contentId!));
    if (!c) return { skipped: 'conteúdo não encontrado' };
    const [def] = await tx
      .select()
      .from(s.clientTeam)
      .where(and(eq(s.clientTeam.clientId, c.clientId), eq(s.clientTeam.function, String(action.function))))
      .limit(1);
    const assigneeId = def?.memberId ?? c.designerId ?? c.ownerId;
    const task = await createTaskIn(kit, {
      title: `Alteração: ${c.title} (V${(ev.payload as { version: number }).version})`,
      description: 'Pedido de alteração do cliente. Veja comentários e marcações na versão.',
      clientId: c.clientId,
      assigneeId,
      contentId: c.id,
      priority: 'high',
      slaPolicyKey: String(action.policy),
      originType: 'content_change',
      originId: c.id,
      idempotencyKey: `change:${ev.id}`,
    });
    return { taskId: task.id, assigneeId };
  },

  async generate_invoices(kit, ev) {
    const [ct] = await kit.tx
      .select()
      .from(s.contracts)
      .where(eq(s.contracts.id, p(ev).contractId!));
    if (!ct) return { skipped: 'contrato não encontrado' };
    const first = ct.startOn.slice(0, 7);
    const now = new Date().toISOString().slice(0, 7);
    const created = [];
    // Setup e mensalidade da competência de início; se o contrato começou antes, até a competência atual.
    for (let m = first; m <= now || m === first;) {
      created.push(...(await generateInvoicesIn(kit, ct.id, m)));
      const [y, mo] = m.split('-').map(Number) as [number, number];
      m = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
      if (m > now) break;
    }
    return { invoices: created.length };
  },

  async notify_assignee(kit, ev) {
    const { tx, ctx } = kit;
    const [t] = await tx
      .select()
      .from(s.tasks)
      .where(eq(s.tasks.id, p(ev).taskId!));
    if (!t || !t.assigneeId) return { skipped: 'sem responsável' };
    if (ev.actor_id) {
      const [me] = await tx.select().from(s.workspaceMembers).where(eq(s.workspaceMembers.id, t.assigneeId));
      if (me?.userId === ev.actor_id) return { skipped: 'atribuída a si mesmo' };
    }
    const n = await notifyIn(tx, ctx.workspaceId, {
      memberIds: [t.assigneeId],
      type: 'task.assigned',
      title: `Nova tarefa: ${t.title}`,
      body: t.dueAt ? `Prazo ${t.dueAt.toISOString()}` : undefined,
      link: `/tarefas/${t.id}`,
      entityType: 'task',
      entityId: t.id,
      dedupeKey: ev.id,
    });
    return { notified: n };
  },

  async notify_finance(kit, ev) {
    const { tx, ctx } = kit;
    const [inv] = await tx
      .select()
      .from(s.invoices)
      .where(eq(s.invoices.id, p(ev).invoiceId!));
    if (!inv) return { skipped: 'fatura não encontrada' };
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, inv.clientId));
    const finance = await membersWithRole(tx, ['financeiro', 'admin']);
    const n = await notifyIn(tx, ctx.workspaceId, {
      memberIds: [...finance, client?.ownerId],
      type: 'invoice.overdue',
      title: `Cobrança atrasada: ${client?.name ?? ''}`,
      body: `${inv.number} · venceu em ${inv.dueOn}`,
      link: '/financeiro/receber',
      entityType: 'invoice',
      entityId: inv.id,
      dedupeKey: ev.id,
    });
    return { notified: n };
  },

  async notify_triage(kit, ev) {
    const { tx, ctx } = kit;
    const [r] = await tx
      .select()
      .from(s.requests)
      .where(eq(s.requests.id, p(ev).requestId!));
    if (!r) return { skipped: 'solicitação não encontrada' };
    const team = await tx
      .select({ m: s.clientTeam.memberId })
      .from(s.clientTeam)
      .where(and(eq(s.clientTeam.clientId, r.clientId), eq(s.clientTeam.function, 'atendimento')));
    const fallback = team.length ? [] : await membersWithRole(tx, ['atendimento', 'gestor']);
    const n = await notifyIn(tx, ctx.workspaceId, {
      memberIds: [...team.map((t) => t.m), ...fallback],
      type: 'request.created',
      title: `Nova solicitação para triagem: ${r.title}`,
      body: 'SLA de triagem: 2 horas úteis',
      link: `/solicitacoes/${r.id}`,
      entityType: 'request',
      entityId: r.id,
      dedupeKey: ev.id,
    });
    return { notified: n };
  },

  async notify_sla(kit, ev) {
    const { tx, ctx } = kit;
    const pl = p(ev);
    let memberIds: (string | null)[] = [];
    let title = '';
    let link = '';
    const label = ev.type === 'sla.overdue' ? 'atrasada' : 'perto do prazo';
    if (pl.entityType === 'task') {
      const [t] = await tx.select().from(s.tasks).where(eq(s.tasks.id, pl.entityId!));
      if (!t || ['done', 'cancelled'].includes(t.status)) return { skipped: 'tarefa encerrada' };
      memberIds = [t.assigneeId];
      title = `Tarefa ${label}: ${t.title}`;
      link = `/tarefas/${t.id}`;
    } else if (pl.entityType === 'request') {
      const [r] = await tx.select().from(s.requests).where(eq(s.requests.id, pl.entityId!));
      if (!r) return { skipped: 'solicitação não encontrada' };
      memberIds = [r.assigneeId];
      if (!r.assigneeId) memberIds = await membersWithRole(tx, ['atendimento', 'gestor']);
      title = `Solicitação ${label}: ${r.title}`;
      link = `/solicitacoes/${r.id}`;
    }
    const n = await notifyIn(tx, ctx.workspaceId, {
      memberIds,
      type: ev.type,
      title,
      link,
      entityType: pl.entityType,
      entityId: pl.entityId,
      dedupeKey: ev.id,
    });
    return { notified: n };
  },

  async notify_won(kit, ev) {
    const { tx, ctx } = kit;
    const [o] = await tx
      .select()
      .from(s.opportunities)
      .where(eq(s.opportunities.id, p(ev).opportunityId!));
    if (!o) return { skipped: 'oportunidade não encontrada' };
    const gestores = await membersWithRole(tx, ['gestor', 'admin']);
    const n = await notifyIn(tx, ctx.workspaceId, {
      memberIds: [...gestores, o.ownerId],
      type: 'opportunity.won',
      title: `Venda ganha: ${o.title}`,
      body: 'Transforme em cliente para iniciar o onboarding.',
      link: `/comercial/oportunidades/${o.id}`,
      entityType: 'opportunity',
      entityId: o.id,
      dedupeKey: ev.id,
    });
    return { notified: n };
  },

  async notify_owner(kit, ev) {
    const { tx, ctx } = kit;
    const pl = p(ev);
    if (ev.type === 'content.submitted') {
      const [c] = await tx.select().from(s.contents).where(eq(s.contents.id, pl.contentId!));
      if (!c) return { skipped: 'conteúdo não encontrado' };
      const team = await tx
        .select({ m: s.clientTeam.memberId })
        .from(s.clientTeam)
        .where(and(eq(s.clientTeam.clientId, c.clientId), eq(s.clientTeam.function, 'atendimento')));
      const n = await notifyIn(tx, ctx.workspaceId, {
        memberIds: team.map((t) => t.m),
        type: ev.type,
        title: `Enviado ao cliente: ${c.title}`,
        link: `/conteudos/${c.id}`,
        entityType: 'content',
        entityId: c.id,
        dedupeKey: ev.id,
      });
      return { notified: n };
    }
    if (ev.type === 'contract.expiring') {
      const [c] = await tx.select().from(s.clients).where(eq(s.clients.id, pl.clientId!));
      const n = await notifyIn(tx, ctx.workspaceId, {
        memberIds: [c?.ownerId, ...(await membersWithRole(tx, ['comercial', 'gestor']))],
        type: ev.type,
        title: `Contrato vencendo: ${c?.name ?? ''}`,
        link: `/clientes/${pl.clientId}`,
        entityType: 'client',
        entityId: pl.clientId,
        dedupeKey: ev.id,
      });
      return { notified: n };
    }
    return { skipped: 'sem destinatário' };
  },
};

const matches = (trigger: string, type: string) => trigger.split('|').includes(type);

/**
 * Motor TRIGGER → CONDITION → ACTION (V3, seção 9). Cada (regra, evento) executa uma única vez:
 * a execução é gravada na MESMA transação das ações (sucesso) — repetir o evento não duplica nada.
 */
export const MAX_DEPTH = 3;

/** Condições simples sobre o payload: { "daysLeft": { "lte": 90 }, "type": { "eq": "video" } }. */
export function conditionsMatch(
  conditions: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  for (const [path, rule] of Object.entries(conditions ?? {})) {
    const v = path
      .split('.')
      .reduce<unknown>(
        (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
        payload,
      );
    for (const [op, expected] of Object.entries((rule ?? {}) as Record<string, unknown>)) {
      const ok =
        op === 'eq'
          ? v === expected
          : op === 'neq'
            ? v !== expected
            : op === 'lte'
              ? Number(v) <= Number(expected)
              : op === 'gte'
                ? Number(v) >= Number(expected)
                : op === 'in'
                  ? Array.isArray(expected) && expected.includes(v)
                  : false;
      if (!ok) return false;
    }
  }
  return true;
}

export async function handleEvent(ev: ClaimedEvent): Promise<{ rule: string; status: string }[]> {
  // Ações das regras rodam um nível abaixo do evento: regra disparando regra para no limite (anti-loop).
  const ctx = systemCtx(ev.workspace_id, 'automation', (ev.depth ?? 0) + 1);
  const rules = await command('automation.loadRules', ctx, ({ tx }) =>
    tx
      .select()
      .from(s.automationRules)
      .where(and(eq(s.automationRules.active, true))),
  );
  const out: { rule: string; status: string }[] = [];
  for (const rule of rules.filter((r) => matches(r.trigger, ev.type))) {
    const started = Date.now();
    try {
      const status = await command(`automation.${rule.key}`, ctx, async (kit) => {
        const done = await kit.tx
          .select({ id: s.automationExecutions.id })
          .from(s.automationExecutions)
          .where(
            and(
              eq(s.automationExecutions.ruleId, rule.id),
              eq(s.automationExecutions.eventId, ev.id),
              ne(s.automationExecutions.status, 'failed'),
            ),
          );
        if (done.length) return 'duplicate';
        const result: Record<string, unknown> = {};
        if ((ev.depth ?? 0) >= MAX_DEPTH) result.skipped = `profundidade máxima (${MAX_DEPTH}) atingida`;
        else if (!conditionsMatch(rule.conditions, ev.payload)) result.skipped = 'condições não atendidas';
        for (const action of result.skipped ? [] : (rule.actions as Action[])) {
          const h = HANDLERS[action.type];
          if (!h) throw new Error(`Ação desconhecida: ${action.type}`);
          Object.assign(result, await h(kit, ev, action));
        }
        await kit.tx.insert(s.automationExecutions).values({
          workspaceId: ev.workspace_id,
          ruleId: rule.id,
          eventId: ev.id,
          eventType: ev.type,
          status: result.skipped ? 'skipped' : 'ok',
          result,
          durationMs: Date.now() - started,
        });
        return result.skipped ? 'skipped' : 'ok';
      });
      out.push({ rule: rule.key, status });
    } catch (err) {
      log.error({ err: String(err), rule: rule.key, eventId: ev.id }, 'automation.failed');
      await command('automation.recordFailure', ctx, ({ tx }) =>
        tx.insert(s.automationExecutions).values({
          workspaceId: ev.workspace_id,
          ruleId: rule.id,
          eventId: ev.id,
          eventType: ev.type,
          status: 'failed',
          error: String(err).slice(0, 2000),
          durationMs: Date.now() - started,
        }),
      ).catch(() => undefined);
      out.push({ rule: rule.key, status: 'failed' });
      throw err;
    }
  }
  return out;
}
