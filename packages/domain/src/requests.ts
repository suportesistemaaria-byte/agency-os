import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { liveStatuses, pauseClock, resumeClock, startClock, stopClock } from './sla-clock';
import { createTaskIn } from './tasks';
import { REQUEST_TYPE_LABEL, REQUEST_STATUS_LABEL, REQUEST_FLOW } from './labels';
export { REQUEST_TYPE_LABEL, REQUEST_STATUS_LABEL, REQUEST_FLOW };

type RequestType = (typeof s.requestType.enumValues)[number];
type RequestStatus = (typeof s.requestStatus.enumValues)[number];

/** Tipo de solicitação → política de SLA de produção. */
export function policyForRequest(type: RequestType, urgent: boolean): string {
  switch (type) {
    case 'alteracao':
      return urgent ? 'alteracao_urgente' : 'alteracao';
    case 'arte_impresso':
      return 'arte_impresso';
    case 'video':
      return 'video';
    case 'fotos_editadas':
      return 'fotos_editadas';
    case 'cardapio':
    case 'catalogo':
      return 'cardapio_catalogo';
    default:
      return 'arte_estatica';
  }
}

/** Função padrão da equipe da conta para cada tipo de solicitação. */
export function functionForRequest(type: RequestType): string {
  if (type === 'video') return 'editor';
  if (type === 'outro') return 'atendimento';
  return 'design';
}

async function getRequest(tx: Tx, id: string) {
  const [r] = await tx.select().from(s.requests).where(eq(s.requests.id, id));
  return must(r, 'Solicitação não encontrada.');
}

export interface CreateRequestInput {
  clientId: string;
  type: RequestType;
  title: string;
  description?: string;
  origin?: 'internal' | 'portal' | 'whatsapp' | 'email';
  urgent?: boolean;
  inScope?: boolean;
  requestedByContactId?: string;
}

export async function createRequestIn(kit: CommandKit, input: CreateRequestInput) {
  const { tx, ctx } = kit;
  if (!input.title.trim()) throw badRequest('Informe o título da solicitação.');
  const [r] = await tx
    .insert(s.requests)
    .values({
      workspaceId: ctx.workspaceId,
      clientId: input.clientId,
      type: input.type,
      title: input.title.trim(),
      description: input.description,
      origin: input.origin ?? 'internal',
      urgent: input.urgent ?? false,
      inScope: input.inScope ?? true,
      requestedByContactId: input.requestedByContactId,
      status: 'triage',
      createdBy: ctx.userId ?? null,
    })
    .returning();
  // Triagem com SLA de 2 horas úteis (V3, regra request.created).
  const clock = await startClock(kit, { type: 'request', id: r!.id }, 'triagem');
  await tx.update(s.requests).set({ slaClockId: clock.id }).where(eq(s.requests.id, r!.id));
  await tx.insert(s.requestStatusHistory).values([
    { workspaceId: ctx.workspaceId, requestId: r!.id, fromStatus: null, toStatus: 'received', actorId: null },
    {
      workspaceId: ctx.workspaceId,
      requestId: r!.id,
      fromStatus: 'received',
      toStatus: 'triage',
      actorId: null,
    },
  ]);
  await kit.audit({ action: 'request.created', entityType: 'request', entityId: r!.id, after: r! });
  await kit.emit({
    type: 'request.created',
    entityType: 'request',
    entityId: r!.id,
    payload: { requestId: r!.id, clientId: input.clientId, type: input.type },
  });
  return { ...r!, slaClockId: clock.id };
}

export async function createRequest(ctx: Ctx, input: CreateRequestInput) {
  assertCan(ctx, 'requests.edit', { clientId: input.clientId });
  return command('requests.create', ctx, (kit) => createRequestIn(kit, input));
}

/**
 * Triagem: define responsável e escopo. Fecha o relógio de triagem, abre o de produção pela política
 * do tipo e cria a tarefa de produção ligada ao mesmo relógio.
 */
export async function triageRequest(
  ctx: Ctx,
  id: string,
  input: { assigneeId?: string | null; inScope?: boolean; urgent?: boolean },
) {
  return command('requests.triage', ctx, async (kit) => {
    const { tx } = kit;
    const r = await getRequest(tx, id);
    assertCan(ctx, 'requests.edit', { clientId: r.clientId });
    if (r.status !== 'triage' && r.status !== 'received')
      throw badRequest('A solicitação já passou pela triagem.');
    let assigneeId = input.assigneeId ?? null;
    if (!assigneeId) {
      const [def] = await tx
        .select()
        .from(s.clientTeam)
        .where(
          and(eq(s.clientTeam.clientId, r.clientId), eq(s.clientTeam.function, functionForRequest(r.type))),
        )
        .limit(1);
      assigneeId = def?.memberId ?? null;
    }
    if (!assigneeId) throw badRequest('Defina o responsável (a equipe da conta não tem responsável padrão).');
    const now = new Date();
    if (r.slaClockId) await stopClock(kit, r.slaClockId, now);
    const urgent = input.urgent ?? r.urgent;
    const clock = await startClock(kit, { type: 'request', id }, policyForRequest(r.type, urgent), now);
    await tx
      .update(s.requests)
      .set({
        status: 'assigned',
        assigneeId,
        inScope: input.inScope ?? r.inScope,
        urgent,
        slaClockId: clock.id,
        updatedAt: now,
      })
      .where(eq(s.requests.id, id));
    await tx.insert(s.requestStatusHistory).values({
      workspaceId: ctx.workspaceId,
      requestId: id,
      fromStatus: r.status,
      toStatus: 'assigned',
      actorId: ctx.actorType === 'user' ? ctx.memberId : null,
    });
    await createTaskIn(kit, {
      title: r.title,
      description: r.description ?? undefined,
      clientId: r.clientId,
      assigneeId,
      priority: urgent ? 'urgent' : 'normal',
      requestId: id,
      originType: 'request',
      originId: id,
      slaClockId: clock.id,
      dueAt: clock.dueAt,
      idempotencyKey: `request:${id}:production`,
    });
    await kit.audit({
      action: 'request.triaged',
      entityType: 'request',
      entityId: id,
      before: { status: r.status, assigneeId: r.assigneeId },
      after: { status: 'assigned', assigneeId, inScope: input.inScope ?? r.inScope },
    });
    await kit.emit({
      type: 'request.triaged',
      entityType: 'request',
      entityId: id,
      payload: { requestId: id, assigneeId },
    });
  });
}

export async function setRequestStatus(ctx: Ctx, id: string, to: RequestStatus, note?: string) {
  return command('requests.setStatus', ctx, async (kit) => {
    const { tx } = kit;
    const r = await getRequest(tx, id);
    assertCan(ctx, 'requests.edit', { clientId: r.clientId, ownerMemberIds: [r.assigneeId] });
    if (r.status === to) return;
    if (r.status === 'delivered' || r.status === 'cancelled') throw badRequest('Solicitação encerrada.');
    if (to !== 'cancelled') {
      const fi = REQUEST_FLOW.indexOf(r.status);
      const ti = REQUEST_FLOW.indexOf(to);
      if (ti < 3 || fi < 2) throw badRequest('Use a triagem para definir o responsável.');
      if (Math.abs(ti - fi) > 1 && to !== 'delivered')
        throw badRequest('Siga o fluxo da solicitação etapa por etapa.');
    }
    const now = new Date();
    if (r.slaClockId) {
      if (to === 'client_approval')
        await pauseClock(kit, r.slaClockId, 'client', 'Aguardando aprovação do cliente', now);
      else if (r.status === 'client_approval') await resumeClock(kit, r.slaClockId, now);
      if (to === 'delivered' || to === 'cancelled') await stopClock(kit, r.slaClockId, now);
    }
    await tx
      .update(s.requests)
      .set({ status: to, deliveredAt: to === 'delivered' ? now : null, updatedAt: now })
      .where(eq(s.requests.id, id));
    if (to === 'delivered' || to === 'cancelled')
      await tx
        .update(s.tasks)
        .set({ status: to === 'delivered' ? 'done' : 'cancelled', completedAt: now })
        .where(and(eq(s.tasks.requestId, id), notInArray(s.tasks.status, ['done', 'cancelled'])));
    await tx.insert(s.requestStatusHistory).values({
      workspaceId: ctx.workspaceId,
      requestId: id,
      fromStatus: r.status,
      toStatus: to,
      actorId: ctx.actorType === 'user' ? ctx.memberId : null,
      note,
    });
    await kit.audit({
      action: 'request.status_changed',
      entityType: 'request',
      entityId: id,
      before: { status: r.status },
      after: { status: to },
    });
    await kit.emit({
      type: 'request.status_changed',
      entityType: 'request',
      entityId: id,
      payload: { requestId: id, from: r.status, to },
    });
  });
}

export async function listRequests(
  ctx: Ctx,
  opts: { clientId?: string; status?: RequestStatus; open?: boolean } = {},
) {
  assertCan(ctx, 'requests.view');
  return read(ctx, async (tx) => {
    const conds = [];
    const sc = scopeWhere(ctx, 'requests.view', {
      client: s.requests.clientId,
      owners: [s.requests.assigneeId],
    });
    if (sc) conds.push(sc);
    if (opts.clientId) conds.push(eq(s.requests.clientId, opts.clientId));
    if (opts.status) conds.push(eq(s.requests.status, opts.status));
    if (opts.open) conds.push(notInArray(s.requests.status, ['delivered', 'cancelled']));
    const rows = await tx
      .select({ r: s.requests, client: s.clients.name, clientColor: s.clients.color, assignee: s.users.name })
      .from(s.requests)
      .innerJoin(s.clients, eq(s.clients.id, s.requests.clientId))
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.requests.assigneeId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(and(...conds))
      .orderBy(desc(s.requests.createdAt));
    const sla = await liveStatuses(
      tx,
      rows.map((r) => r.r.slaClockId),
    );
    return rows.map((x) => ({
      ...x.r,
      clientName: x.client,
      clientColor: x.clientColor,
      assigneeName: x.assignee,
      sla: x.r.slaClockId ? (sla.get(x.r.slaClockId) ?? null) : null,
    }));
  });
}

export async function getRequestDetail(ctx: Ctx, id: string) {
  assertCan(ctx, 'requests.view');
  return read(ctx, async (tx) => {
    const r = await getRequest(tx, id);
    assertCan(ctx, 'requests.view', { clientId: r.clientId, ownerMemberIds: [r.assigneeId] });
    const history = await tx
      .select({ h: s.requestStatusHistory, actor: s.users.name })
      .from(s.requestStatusHistory)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.requestStatusHistory.actorId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.requestStatusHistory.requestId, id))
      .orderBy(asc(s.requestStatusHistory.createdAt));
    const tasks = await tx.select().from(s.tasks).where(eq(s.tasks.requestId, id));
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, r.clientId));
    const clocks = await tx
      .select()
      .from(s.slaClocks)
      .where(and(eq(s.slaClocks.entityType, 'request'), eq(s.slaClocks.entityId, id)))
      .orderBy(asc(s.slaClocks.createdAt));
    const intervals = clocks.length
      ? await tx
          .select()
          .from(s.slaIntervals)
          .where(
            inArray(
              s.slaIntervals.clockId,
              clocks.map((c) => c.id),
            ),
          )
      : [];
    const live = await liveStatuses(tx, [r.slaClockId]);
    const [assignee] = r.assigneeId
      ? await tx
          .select({ name: s.users.name })
          .from(s.workspaceMembers)
          .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(eq(s.workspaceMembers.id, r.assigneeId))
      : [];
    return {
      request: r,
      client: client!,
      assigneeName: assignee?.name ?? null,
      history,
      tasks,
      clocks,
      intervals,
      sla: r.slaClockId ? (live.get(r.slaClockId) ?? null) : null,
    };
  });
}
