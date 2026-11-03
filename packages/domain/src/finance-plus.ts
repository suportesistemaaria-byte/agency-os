import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { adminDb, schema as s } from '@aos/db';
import { assertCan, command, read, systemCtx, type Ctx } from './context';
import { badRequest, must } from './errors';

const todayStr = () => new Date().toISOString().slice(0, 10);
const addMonths = (p: string, n: number) => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Upsell/renovação ganhos viram ADITIVO do contrato vigente (V3): itens novos ligados ao aditivo,
 * vigência estendida na renovação, histórico preservado. Idempotente por oportunidade.
 */
export async function applyAmendment(ctx: Ctx, opportunityId: string, opts: { effectiveOn?: string } = {}) {
  assertCan(ctx, 'comercial.edit');
  assertCan(ctx, 'clientes.edit');
  return command('finance.applyAmendment', ctx, async (kit) => {
    const { tx } = kit;
    await tx.execute(sql`select id from opportunities where id = ${opportunityId} for update`);
    const [o] = await tx.select().from(s.opportunities).where(eq(s.opportunities.id, opportunityId));
    const opp = must(o, 'Oportunidade não encontrada.');
    const [existing] = await tx
      .select()
      .from(s.contractAmendments)
      .where(eq(s.contractAmendments.opportunityId, opportunityId));
    if (existing) return { amendmentId: existing.id, created: false };
    if (opp.type === 'new') throw badRequest('Novo negócio vira cliente pela conversão, não por aditivo.');
    if (opp.state !== 'won') throw badRequest('Só oportunidades ganhas geram aditivo.');
    const [contract] = await tx
      .select()
      .from(s.contracts)
      .where(and(eq(s.contracts.clientId, opp.clientId!), eq(s.contracts.status, 'active')))
      .orderBy(desc(s.contracts.startOn))
      .limit(1);
    const c = must(contract, 'O cliente não tem contrato vigente (confirme o contrato no Financeiro antes).');
    const [prop] = await tx
      .select()
      .from(s.proposals)
      .where(and(eq(s.proposals.opportunityId, opportunityId), eq(s.proposals.status, 'accepted')))
      .limit(1);
    const p = must(prop, 'O aditivo exige proposta aceita.');
    const [v] = await tx
      .select()
      .from(s.proposalVersions)
      .where(and(eq(s.proposalVersions.proposalId, p.id), eq(s.proposalVersions.number, p.currentVersion)));
    const items = await tx.select().from(s.proposalItems).where(eq(s.proposalItems.versionId, v!.id));
    const effectiveOn = opts.effectiveOn ?? todayStr();
    const mrrDelta = items
      .filter((i) => i.kind === 'recurring')
      .reduce((a, i) => a + i.quantity * i.unitCents, 0);
    const setup = items.filter((i) => i.kind === 'setup').reduce((a, i) => a + i.quantity * i.unitCents, 0);
    const newEnd =
      opp.type === 'renewal'
        ? new Date(Date.parse(c.endOn ?? effectiveOn) + 365 * 86_400_000).toISOString().slice(0, 10)
        : null;
    const [am] = await tx
      .insert(s.contractAmendments)
      .values({
        workspaceId: ctx.workspaceId,
        contractId: c.id,
        opportunityId,
        kind: opp.type,
        description: opp.title,
        mrrDeltaCents: mrrDelta,
        setupCents: setup,
        previousEndOn: c.endOn,
        newEndOn: newEnd,
        effectiveOn,
        createdBy: ctx.userId,
      })
      .returning();
    if (items.length)
      await tx.insert(s.contractItems).values(
        items.map((i) => ({
          workspaceId: ctx.workspaceId,
          contractId: c.id,
          amendmentId: am!.id,
          description: `${i.description} (aditivo)`,
          kind: i.kind === 'setup' ? ('one_off' as const) : ('recurring' as const),
          amountCents: i.quantity * i.unitCents,
        })),
      );
    if (newEnd)
      await tx
        .update(s.contracts)
        .set({ endOn: newEnd, updatedAt: new Date() })
        .where(eq(s.contracts.id, c.id));
    if (setup > 0)
      await tx.insert(s.invoices).values({
        workspaceId: ctx.workspaceId,
        clientId: c.clientId,
        contractId: null,
        number: `F-A${String(Date.now()).slice(-6)}`,
        competence: effectiveOn.slice(0, 7),
        kind: 'one_off',
        description: `Setup do aditivo · ${opp.title}`,
        issueOn: todayStr(),
        dueOn: effectiveOn,
        amountCents: setup,
        origin: 'avulsa',
      });
    await tx
      .update(s.opportunities)
      .set({ convertedClientId: opp.clientId, convertedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.opportunities.id, opportunityId));
    await kit.audit({
      action: 'contract.amended',
      entityType: 'contract',
      entityId: c.id,
      before: { endOn: c.endOn },
      after: {
        amendmentId: am!.id,
        kind: opp.type,
        mrrDeltaCents: mrrDelta,
        setupCents: setup,
        endOn: newEnd ?? c.endOn,
      },
    });
    await kit.emit({
      type: 'contract.amended',
      entityType: 'contract',
      entityId: c.id,
      payload: { contractId: c.id, clientId: c.clientId, amendmentId: am!.id, kind: opp.type },
    });
    return { amendmentId: am!.id, created: true };
  });
}

export async function listAmendments(ctx: Ctx, contractId?: string) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.contractAmendments)
      .where(contractId ? eq(s.contractAmendments.contractId, contractId) : undefined)
      .orderBy(desc(s.contractAmendments.createdAt)),
  );
}

/** Despesas recorrentes mensais: gera a da competência seguinte, uma única vez (cron diário, idempotente). */
export async function generateRecurringExpenses(competence = todayStr().slice(0, 7)) {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let n = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    n += await command('finance.recurringExpenses', ctx, async (kit) => {
      const prev = addMonths(competence, -1);
      const base = await kit.tx
        .select()
        .from(s.expenses)
        .where(
          and(
            eq(s.expenses.recurring, 'monthly'),
            eq(s.expenses.competence, prev),
            isNull(s.expenses.deletedAt),
          ),
        );
      const current = await kit.tx.select().from(s.expenses).where(eq(s.expenses.competence, competence));
      let created = 0;
      for (const e of base) {
        if (current.some((x) => x.description === e.description && (x.supplier ?? '') === (e.supplier ?? '')))
          continue;
        const day = e.dueOn.slice(8, 10);
        const last = new Date(
          Date.UTC(Number(competence.slice(0, 4)), Number(competence.slice(5, 7)), 0),
        ).getUTCDate();
        const [row] = await kit.tx
          .insert(s.expenses)
          .values({
            workspaceId: w.id,
            categoryId: e.categoryId,
            clientId: e.clientId,
            description: e.description,
            supplier: e.supplier,
            amountCents: e.amountCents,
            competence,
            dueOn: `${competence}-${String(Math.min(Number(day), last)).padStart(2, '0')}`,
            recurring: 'monthly',
          })
          .returning();
        await kit.emit({
          type: 'expense.created',
          entityType: 'expense',
          entityId: row!.id,
          payload: { expenseId: row!.id },
        });
        created++;
      }
      return created;
    });
  }
  return n;
}

export interface AgingRow {
  clientId: string;
  clientName: string;
  invoices: number;
  totalCents: number;
  oldestDays: number;
  buckets: { d1_30: number; d31_60: number; d61_90: number; d90p: number };
}

/** Inadimplência por cliente com faixas de atraso (1–30, 31–60, 61–90, 90+ dias). */
export async function delinquency(ctx: Ctx, today = todayStr()) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const rows = await tx
      .select({ i: s.invoices, client: s.clients.name })
      .from(s.invoices)
      .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
      .where(
        and(
          isNull(s.invoices.deletedAt),
          inArray(s.invoices.status, ['overdue', 'issued', 'partially_paid']),
          sql`${s.invoices.dueOn} < ${today}`,
        ),
      )
      .orderBy(asc(s.invoices.dueOn));
    const map = new Map<string, AgingRow>();
    for (const { i, client } of rows) {
      const open = i.amountCents - i.paidCents;
      if (open <= 0) continue;
      const d = daysBetween(i.dueOn, today);
      const r = map.get(i.clientId) ?? {
        clientId: i.clientId,
        clientName: client,
        invoices: 0,
        totalCents: 0,
        oldestDays: 0,
        buckets: { d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 },
      };
      r.invoices++;
      r.totalCents += open;
      r.oldestDays = Math.max(r.oldestDays, d);
      r.buckets[d <= 30 ? 'd1_30' : d <= 60 ? 'd31_60' : d <= 90 ? 'd61_90' : 'd90p'] += open;
      map.set(i.clientId, r);
    }
    const list = [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
    const totals = list.reduce(
      (a, r) => ({
        totalCents: a.totalCents + r.totalCents,
        d1_30: a.d1_30 + r.buckets.d1_30,
        d31_60: a.d31_60 + r.buckets.d31_60,
        d61_90: a.d61_90 + r.buckets.d61_90,
        d90p: a.d90p + r.buckets.d90p,
      }),
      { totalCents: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 },
    );
    const [{ receivable }] = (await tx
      .select({
        receivable: sql<number>`coalesce(sum(${s.invoices.amountCents} - ${s.invoices.paidCents}),0)::bigint`,
      })
      .from(s.invoices)
      .where(
        and(
          isNull(s.invoices.deletedAt),
          inArray(s.invoices.status, ['overdue', 'issued', 'partially_paid']),
        ),
      )) as [{ receivable: number }];
    return { clients: list, totals, rate: Number(receivable) ? totals.totalCents / Number(receivable) : 0 };
  });
}

/**
 * Fluxo de caixa básico: realizado (pagamentos recebidos − despesas pagas, pela data de caixa)
 * e projetado por semana (cobranças em aberto pelo vencimento − contas a pagar).
 */
export async function cashFlow(ctx: Ctx, opts: { months?: number; weeks?: number; today?: string } = {}) {
  assertCan(ctx, 'financeiro.view');
  const today = opts.today ?? todayStr();
  const months = opts.months ?? 6;
  const weeks = opts.weeks ?? 12;
  return read(ctx, async (tx) => {
    const pays = await tx.select({ d: s.payments.paidOn, v: s.payments.amountCents }).from(s.payments);
    const paidExp = await tx
      .select({ d: s.expenses.paidOn, v: s.expenses.amountCents })
      .from(s.expenses)
      .where(and(isNull(s.expenses.deletedAt), sql`${s.expenses.paidOn} is not null`));
    const openInv = await tx
      .select({
        d: s.invoices.dueOn,
        v: sql<number>`(${s.invoices.amountCents} - ${s.invoices.paidCents})::bigint`,
        overdue: sql<boolean>`${s.invoices.dueOn} < ${today}`,
      })
      .from(s.invoices)
      .where(
        and(
          isNull(s.invoices.deletedAt),
          inArray(s.invoices.status, ['issued', 'partially_paid', 'overdue']),
        ),
      );
    const openExp = await tx
      .select({ d: s.expenses.dueOn, v: s.expenses.amountCents })
      .from(s.expenses)
      .where(and(isNull(s.expenses.deletedAt), isNull(s.expenses.paidOn)));
    const cur = today.slice(0, 7);
    const realized = Array.from({ length: months }, (_, k) => addMonths(cur, k - months + 1)).map((m) => {
      const inn = pays.filter((p) => p.d.startsWith(m)).reduce((a, p) => a + p.v, 0);
      const out = paidExp.filter((p) => p.d!.startsWith(m)).reduce((a, p) => a + p.v, 0);
      return { period: m, inCents: inn, outCents: out, netCents: inn - out };
    });
    let cumulative = realized.reduce((a, r) => a + r.netCents, 0);
    const start = Date.parse(today);
    const projected = Array.from({ length: weeks }, (_, k) => {
      const from = new Date(start + k * 7 * 86_400_000).toISOString().slice(0, 10);
      const to = new Date(start + (k + 1) * 7 * 86_400_000).toISOString().slice(0, 10);
      // atrasados entram na primeira semana (expectativa de recebimento), sem esconder que estão atrasados
      const inn = openInv
        .filter((i) => (k === 0 ? i.d < to : i.d >= from && i.d < to))
        .reduce((a, i) => a + Number(i.v), 0);
      const out = openExp
        .filter((e) => (k === 0 ? e.d < to : e.d >= from && e.d < to))
        .reduce((a, e) => a + e.v, 0);
      cumulative += inn - out;
      return { weekStart: from, inCents: inn, outCents: out, netCents: inn - out, balanceCents: cumulative };
    });
    return {
      realized,
      projected,
      overdueInCents: openInv.filter((i) => i.overdue).reduce((a, i) => a + Number(i.v), 0),
    };
  });
}

/** Resultado por competência: faturado × despesas por categoria (visão DRE simplificada). */
export async function resultByCategory(ctx: Ctx, period = todayStr().slice(0, 7)) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const exp = await tx
      .select({
        category: s.expenseCategories.name,
        kind: s.expenseCategories.kind,
        v: sql<number>`sum(${s.expenses.amountCents})::bigint`,
      })
      .from(s.expenses)
      .leftJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
      .where(and(eq(s.expenses.competence, period), isNull(s.expenses.deletedAt)))
      .groupBy(s.expenseCategories.name, s.expenseCategories.kind);
    const [{ inv }] = (await tx
      .select({ inv: sql<number>`coalesce(sum(${s.invoices.amountCents}),0)::bigint` })
      .from(s.invoices)
      .where(
        and(eq(s.invoices.competence, period), sql`${s.invoices.status} not in ('cancelled','draft')`),
      )) as [{ inv: number }];
    const categories = exp
      .map((e) => ({
        category: e.category ?? 'Sem categoria',
        kind: e.kind ?? 'variable',
        cents: Number(e.v),
      }))
      .sort((a, b) => b.cents - a.cents);
    const total = categories.reduce((a, c) => a + c.cents, 0);
    return {
      period,
      invoicedCents: Number(inv),
      expensesCents: total,
      resultCents: Number(inv) - total,
      categories,
    };
  });
}

export async function listReceipts(ctx: Ctx, limit = 200) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, (tx) =>
    tx
      .select({
        p: s.payments,
        number: s.invoices.number,
        description: s.invoices.description,
        client: s.clients.name,
      })
      .from(s.payments)
      .innerJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
      .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
      .orderBy(desc(s.payments.paidOn))
      .limit(limit),
  );
}
