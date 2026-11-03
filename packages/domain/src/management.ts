import { and, asc, desc, eq, gte, ilike, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { adminDb, schema as s } from '@aos/db';
import { assertCan, command, read, systemCtx, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { createTaskIn } from './tasks';
import { portfolio } from './clients';
import { financeOverview } from './finance';
import { pipelineBoard } from './crm';
import { can } from './permissions';

// ───────────────────────────── Campanhas ─────────────────────────────

export async function createCampaign(
  ctx: Ctx,
  input: { clientId: string; name: string; objective?: string; startsOn?: string; endsOn?: string },
) {
  assertCan(ctx, 'conteudo.create', { clientId: input.clientId });
  if (!input.name.trim()) throw badRequest('Informe o nome da campanha.');
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn)
    throw badRequest('O fim precisa ser depois do início.');
  return command('campaigns.create', ctx, async (kit) => {
    const [c] = await kit.tx
      .insert(s.campaigns)
      .values({
        workspaceId: ctx.workspaceId,
        clientId: input.clientId,
        name: input.name.trim(),
        objective: input.objective,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      })
      .returning();
    await kit.audit({ action: 'campaign.created', entityType: 'campaign', entityId: c!.id, after: c! });
    await kit.emit({
      type: 'campaign.created',
      entityType: 'campaign',
      entityId: c!.id,
      payload: { campaignId: c!.id, clientId: input.clientId },
    });
    return c!;
  });
}

export async function setContentCampaign(ctx: Ctx, contentId: string, campaignId: string | null) {
  return command('campaigns.assignContent', ctx, async (kit) => {
    const [c] = await kit.tx.select().from(s.contents).where(eq(s.contents.id, contentId));
    const content = must(c);
    assertCan(ctx, 'conteudo.create', { clientId: content.clientId, ownerMemberIds: [content.ownerId] });
    if (campaignId) {
      const [camp] = await kit.tx.select().from(s.campaigns).where(eq(s.campaigns.id, campaignId));
      if (must(camp).clientId !== content.clientId) throw badRequest('A campanha é de outro cliente.');
    }
    await kit.tx
      .update(s.contents)
      .set({ campaignId, updatedAt: new Date() })
      .where(eq(s.contents.id, contentId));
  });
}

export async function getCampaign(ctx: Ctx, id: string) {
  assertCan(ctx, 'conteudo.view');
  return read(ctx, async (tx) => {
    const [c] = await tx.select().from(s.campaigns).where(eq(s.campaigns.id, id));
    const camp = must(c, 'Campanha não encontrada.');
    assertCan(ctx, 'conteudo.view', { clientId: camp.clientId });
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, camp.clientId));
    const contents = await tx
      .select()
      .from(s.contents)
      .where(and(eq(s.contents.campaignId, id), isNull(s.contents.deletedAt)))
      .orderBy(asc(s.contents.scheduledAt));
    const done = contents.filter((x) => ['approved', 'scheduled', 'posted'].includes(x.stage)).length;
    return {
      campaign: camp,
      client: client!,
      contents,
      progress: contents.length ? done / contents.length : 0,
    };
  });
}

// ───────────────────────────── Reuniões ─────────────────────────────

export async function getMeeting(ctx: Ctx, id: string) {
  return read(ctx, async (tx) => {
    const [m] = await tx.select().from(s.meetings).where(eq(s.meetings.id, id));
    const meeting = must(m, 'Reunião não encontrada.');
    const parts = await tx
      .select({ memberId: s.meetingParticipants.memberId, name: s.users.name })
      .from(s.meetingParticipants)
      .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.meetingParticipants.memberId))
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.meetingParticipants.meetingId, id));
    if (ctx.perms.get('clientes.view') !== 'all' && !parts.some((p) => p.memberId === ctx.memberId))
      assertCan(ctx, '__participante__');
    const decisions = await tx
      .select({ d: s.meetingDecisions, owner: s.users.name, taskStatus: s.tasks.status })
      .from(s.meetingDecisions)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.meetingDecisions.ownerId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .leftJoin(s.tasks, eq(s.tasks.id, s.meetingDecisions.taskId))
      .where(eq(s.meetingDecisions.meetingId, id))
      .orderBy(asc(s.meetingDecisions.createdAt));
    const [client] = meeting.clientId
      ? await tx.select().from(s.clients).where(eq(s.clients.id, meeting.clientId))
      : [];
    return { meeting, participants: parts, decisions, client: client ?? null };
  });
}

export async function updateMeetingNotes(ctx: Ctx, id: string, notes: string) {
  return command('meetings.notes', ctx, async (kit) => {
    const [m] = await kit.tx.select().from(s.meetings).where(eq(s.meetings.id, id));
    must(m);
    await kit.tx.update(s.meetings).set({ notes, updatedAt: new Date() }).where(eq(s.meetings.id, id));
  });
}

/** Decisão de reunião vira tarefa para o responsável (prazo pela @aos/sla quando houver política). */
export async function addMeetingDecision(
  ctx: Ctx,
  meetingId: string,
  input: { description: string; ownerId: string; slaPolicyKey?: string; dueAt?: Date | null },
) {
  if (!input.description.trim()) throw badRequest('Descreva a decisão.');
  assertCan(ctx, 'tasks.edit');
  return command('meetings.decision', ctx, async (kit) => {
    const [m] = await kit.tx.select().from(s.meetings).where(eq(s.meetings.id, meetingId));
    const meeting = must(m, 'Reunião não encontrada.');
    const [d] = await kit.tx
      .insert(s.meetingDecisions)
      .values({
        workspaceId: ctx.workspaceId,
        meetingId,
        description: input.description.trim(),
        ownerId: input.ownerId,
        createdBy: ctx.userId,
      })
      .returning();
    const task = await createTaskIn(kit, {
      title: input.description.trim(),
      description: `Decisão da reunião "${meeting.title}".`,
      clientId: meeting.clientId,
      opportunityId: meeting.opportunityId ?? undefined,
      assigneeId: input.ownerId,
      originType: 'meeting',
      originId: meetingId,
      slaPolicyKey: input.slaPolicyKey,
      dueAt: input.dueAt ?? null,
      idempotencyKey: `meeting-decision:${d!.id}`,
    });
    await kit.tx.update(s.meetingDecisions).set({ taskId: task.id }).where(eq(s.meetingDecisions.id, d!.id));
    await kit.audit({
      action: 'meeting.decision_created',
      entityType: 'meeting',
      entityId: meetingId,
      after: { decision: input.description, taskId: task.id },
    });
    await kit.emit({
      type: 'meeting.decision_created',
      entityType: 'meeting',
      entityId: meetingId,
      payload: { meetingId, decisionId: d!.id, taskId: task.id },
    });
    return { decisionId: d!.id, taskId: task.id };
  });
}

// ───────────────────────────── Arquivos ─────────────────────────────

export async function listFiles(ctx: Ctx, opts: { clientId?: string; q?: string } = {}) {
  assertCan(ctx, 'clientes.view');
  return read(ctx, async (tx) => {
    const conds = [isNull(s.files.deletedAt)];
    if (opts.clientId) conds.push(eq(s.files.clientId, opts.clientId));
    if (opts.q?.trim()) conds.push(ilike(s.files.name, `%${opts.q.trim().replace(/[%_]/g, '')}%`));
    const sc = scopeWhere(ctx, 'clientes.view', { client: s.files.clientId });
    if (sc) conds.push(sc);
    return tx
      .select({ f: s.files, client: s.clients.name, clientColor: s.clients.color, uploader: s.users.name })
      .from(s.files)
      .leftJoin(s.clients, eq(s.clients.id, s.files.clientId))
      .leftJoin(s.users, eq(s.users.id, s.files.uploadedBy))
      .where(and(...conds))
      .orderBy(desc(s.files.createdAt))
      .limit(300);
  });
}

// ───────────────────────────── Equipe (carga) ─────────────────────────────

export async function teamLoad(ctx: Ctx) {
  assertCan(ctx, 'members.manage');
  return read(ctx, async (tx) => {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);
    const members = await tx
      .select({ id: s.workspaceMembers.id, name: s.users.name, status: s.workspaceMembers.status })
      .from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.workspaceMembers.status, 'active'))
      .orderBy(asc(s.users.name));
    const roles = await tx
      .select({ memberId: s.memberRoles.memberId, name: s.roles.name })
      .from(s.memberRoles)
      .innerJoin(s.roles, eq(s.roles.id, s.memberRoles.roleId));
    const stats = await tx
      .select({
        m: s.tasks.assigneeId,
        open: sql<number>`count(*) filter (where ${s.tasks.status} not in ('done','cancelled'))::int`,
        overdue: sql<number>`count(*) filter (where ${s.tasks.status} not in ('done','cancelled') and ${s.tasks.dueAt} < ${now})::int`,
        week: sql<number>`count(*) filter (where ${s.tasks.status} not in ('done','cancelled') and ${s.tasks.dueAt} >= ${now} and ${s.tasks.dueAt} < ${week})::int`,
        blocked: sql<number>`count(*) filter (where ${s.tasks.status} = 'blocked')::int`,
        review: sql<number>`count(*) filter (where ${s.tasks.status} = 'review')::int`,
        done30: sql<number>`count(*) filter (where ${s.tasks.status} = 'done' and ${s.tasks.completedAt} > now() - interval '30 days')::int`,
      })
      .from(s.tasks)
      .groupBy(s.tasks.assigneeId);
    const accounts = await tx
      .select({ m: s.clientTeam.memberId, n: sql<number>`count(distinct ${s.clientTeam.clientId})::int` })
      .from(s.clientTeam)
      .groupBy(s.clientTeam.memberId);
    const rows = members.map((mb) => {
      const st = stats.find((x) => x.m === mb.id);
      const open = st?.open ?? 0;
      const overdue = st?.overdue ?? 0;
      return {
        ...mb,
        roles: roles.filter((r) => r.memberId === mb.id).map((r) => r.name),
        open,
        overdue,
        week: st?.week ?? 0,
        blocked: st?.blocked ?? 0,
        review: st?.review ?? 0,
        done30: st?.done30 ?? 0,
        accounts: accounts.find((a) => a.m === mb.id)?.n ?? 0,
        load:
          overdue > 2 || open > 12 ? ('high' as const) : open > 6 ? ('medium' as const) : ('low' as const),
      };
    });
    return rows;
  });
}

// ───────────────────────────── Health score diário ─────────────────────────────

/** Snapshot diário do health score com fatores (job entre workspaces, idempotente por cliente/dia). */
export async function snapshotHealth(date = new Date().toISOString().slice(0, 10)) {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let n = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    const p = await portfolio(ctx);
    await command('clients.healthSnapshot', ctx, async (kit) => {
      for (const c of p.clients) {
        if (c.health.score === null) continue;
        const [prev] = await kit.tx
          .select()
          .from(s.clientHealthScores)
          .where(eq(s.clientHealthScores.clientId, c.id))
          .orderBy(desc(s.clientHealthScores.date))
          .limit(1);
        const rows = await kit.tx
          .insert(s.clientHealthScores)
          .values({
            workspaceId: w.id,
            clientId: c.id,
            date,
            score: c.health.score,
            factors: c.health.factors,
          })
          .onConflictDoNothing()
          .returning();
        if (rows.length) n++;
        if (rows.length && prev && prev.date !== date && Math.abs(prev.score - c.health.score) >= 10)
          await kit.emit({
            type: 'client.health_changed',
            entityType: 'client',
            entityId: c.id,
            payload: { clientId: c.id, from: prev.score, to: c.health.score },
            idempotencyKey: `health:${c.id}:${date}`,
          });
      }
    });
  }
  return n;
}

export async function healthHistory(ctx: Ctx, clientId: string, days = 90) {
  assertCan(ctx, 'clientes.view', { clientId });
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.clientHealthScores)
      .where(
        and(
          eq(s.clientHealthScores.clientId, clientId),
          gte(s.clientHealthScores.date, new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(s.clientHealthScores.date)),
  );
}

// ───────────────────────────── Painel executivo ─────────────────────────────

/** Painel executivo: só monta os blocos que a permissão do usuário permite. */
export async function executiveDashboard(ctx: Ctx) {
  assertCan(ctx, 'reports.view');
  const showFinance = can(ctx, 'financeiro.view');
  const [p, fin, board] = await Promise.all([
    portfolio(ctx),
    showFinance ? financeOverview(ctx) : null,
    can(ctx, 'comercial.view') ? pipelineBoard(ctx) : null,
  ]);
  const sla = await read(ctx, async (tx) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const closed = await tx
      .select({ status: s.slaClocks.status, n: sql<number>`count(*)::int` })
      .from(s.slaClocks)
      .where(
        and(
          gte(s.slaClocks.stoppedAt, since),
          inArray(s.slaClocks.status, ['met', 'missed']),
          notInArray(s.slaClocks.policyKey, ['triagem']),
        ),
      )
      .groupBy(s.slaClocks.status);
    const open = await tx
      .select({ status: s.slaClocks.status, n: sql<number>`count(*)::int` })
      .from(s.slaClocks)
      .where(isNull(s.slaClocks.stoppedAt))
      .groupBy(s.slaClocks.status);
    const met = closed.find((x) => x.status === 'met')?.n ?? 0;
    const missed = closed.find((x) => x.status === 'missed')?.n ?? 0;
    const approvals = await tx
      .select({ action: s.contentApprovals.action, n: sql<number>`count(*)::int` })
      .from(s.contentApprovals)
      .where(gte(s.contentApprovals.createdAt, since))
      .groupBy(s.contentApprovals.action);
    return {
      compliance: met + missed ? met / (met + missed) : null,
      met,
      missed,
      open: Object.fromEntries(open.map((o) => [o.status, o.n])) as Record<string, number>,
      approvals: Object.fromEntries(approvals.map((a) => [a.action, a.n])) as Record<string, number>,
    };
  });
  const bands = { healthy: 0, attention: 0, critical: 0, onboarding: 0 };
  for (const c of p.clients) bands[c.health.band]++;
  const firstPass =
    sla.approvals.approved || sla.approvals.approved_on_behalf
      ? ((sla.approvals.approved ?? 0) + (sla.approvals.approved_on_behalf ?? 0)) /
        Math.max(1, sla.approvals.submitted ?? 0)
      : null;
  return {
    clients: {
      total: p.clients.length,
      bands,
      risks: p.clients
        .filter((c) => c.health.band === 'critical' || c.health.band === 'attention')
        .slice(0, 6),
    },
    finance: fin
      ? {
          mrrCents: fin.summary.mrrCents,
          overdueCents: fin.summary.overdueCents,
          receivedCents: fin.summary.receivedCents,
          contractedCents: fin.summary.contractedCents,
          series: fin.series,
        }
      : null,
    commercial: board
      ? {
          potentialCents: board.totals.potentialMrrCents,
          forecastCents: board.totals.forecastCents,
          open: board.totals.openCount,
          overdueFollowups: board.totals.overdueFollowups.length,
        }
      : null,
    sla: { ...sla, firstPassRate: firstPass },
  };
}
