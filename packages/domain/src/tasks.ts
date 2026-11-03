import { and, asc, desc, eq, exists, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { liveStatuses, pauseClock, resumeClock, startClock, stopClock } from './sla-clock';
import { can } from './permissions';
import { TASK_STATUS_LABEL, PRIORITY_LABEL } from './labels';
export { TASK_STATUS_LABEL, PRIORITY_LABEL };

type Priority = (typeof s.priority.enumValues)[number];
type TaskStatus = (typeof s.taskStatus.enumValues)[number];
type Task = typeof s.tasks.$inferSelect;

const taskOwners = (t: Task, participants: string[] = []) => ({
  clientId: t.clientId,
  ownerMemberIds: [t.assigneeId, ...participants],
});

async function getTask(tx: Tx, id: string) {
  const [t] = await tx.select().from(s.tasks).where(eq(s.tasks.id, id));
  const task = must(t, 'Tarefa não encontrada.');
  const parts = await tx
    .select({ m: s.taskAssignees.memberId })
    .from(s.taskAssignees)
    .where(eq(s.taskAssignees.taskId, id));
  return { task, participants: parts.map((p) => p.m) };
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  clientId?: string | null;
  assigneeId?: string | null;
  participantIds?: string[];
  priority?: Priority;
  /** Prazo manual escolhido pela pessoa. Prazos calculados vêm sempre de slaPolicyKey. */
  dueAt?: Date | null;
  slaPolicyKey?: string;
  dependsOn?: string[];
  requestId?: string;
  contentId?: string;
  opportunityId?: string;
  originType?: string;
  originId?: string;
  idempotencyKey?: string;
  slaClockId?: string;
}

/** Cria a tarefa dentro de um comando existente (usado por automações e outros serviços). */
export async function createTaskIn(kit: CommandKit, input: CreateTaskInput): Promise<Task> {
  const { tx, ctx } = kit;
  if (!input.title.trim()) throw badRequest('Informe o título da tarefa.');
  if (input.idempotencyKey) {
    const [dup] = await tx.select().from(s.tasks).where(eq(s.tasks.idempotencyKey, input.idempotencyKey));
    if (dup) return dup;
  }
  const [task] = await tx
    .insert(s.tasks)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title.trim(),
      description: input.description,
      clientId: input.clientId ?? null,
      assigneeId: input.assigneeId ?? null,
      priority: input.priority ?? 'normal',
      dueAt: input.dueAt ?? null,
      requestId: input.requestId,
      contentId: input.contentId,
      opportunityId: input.opportunityId,
      originType: input.originType ?? 'manual',
      originId: input.originId,
      idempotencyKey: input.idempotencyKey,
      slaClockId: input.slaClockId,
      createdBy: ctx.userId ?? null,
    })
    .returning();
  let t = task!;
  if (input.slaPolicyKey && !input.slaClockId) {
    const clock = await startClock(kit, { type: 'task', id: t.id }, input.slaPolicyKey);
    [t] = (await tx
      .update(s.tasks)
      .set({ slaClockId: clock.id, dueAt: clock.dueAt })
      .where(eq(s.tasks.id, t.id))
      .returning()) as [Task];
  }
  if (input.participantIds?.length)
    await tx
      .insert(s.taskAssignees)
      .values(input.participantIds.map((m) => ({ workspaceId: ctx.workspaceId, taskId: t.id, memberId: m })))
      .onConflictDoNothing();
  if (input.dependsOn?.length)
    await tx
      .insert(s.taskDependencies)
      .values(input.dependsOn.map((d) => ({ workspaceId: ctx.workspaceId, taskId: t.id, dependsOnId: d })));
  await kit.audit({ action: 'task.created', entityType: 'task', entityId: t.id, after: t });
  await kit.emit({
    type: 'task.created',
    entityType: 'task',
    entityId: t.id,
    payload: { taskId: t.id, assigneeId: t.assigneeId },
  });
  if (t.assigneeId)
    await kit.emit({
      type: 'task.assigned',
      entityType: 'task',
      entityId: t.id,
      payload: { taskId: t.id, assigneeId: t.assigneeId },
    });
  return t;
}

export async function createTask(ctx: Ctx, input: CreateTaskInput) {
  assertCan(ctx, 'tasks.edit', {
    clientId: input.clientId,
    ownerMemberIds: [input.assigneeId ?? ctx.memberId],
  });
  return command('tasks.create', ctx, (kit) =>
    createTaskIn(kit, {
      ...input,
      assigneeId: input.assigneeId === undefined ? ctx.memberId : input.assigneeId,
    }),
  );
}

export async function updateTask(
  ctx: Ctx,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    priority: Priority;
    dueAt: Date | null;
    clientId: string | null;
  }>,
) {
  return command('tasks.update', ctx, async (kit) => {
    const { task, participants } = await getTask(kit.tx, id);
    assertCan(ctx, 'tasks.edit', taskOwners(task, participants));
    if (patch.dueAt !== undefined && task.slaClockId)
      throw badRequest('O prazo desta tarefa vem do SLA. Use a alteração manual de SLA (com motivo).');
    const [after] = await kit.tx
      .update(s.tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(s.tasks.id, id))
      .returning();
    await kit.audit({
      action: 'task.updated',
      entityType: 'task',
      entityId: id,
      before: task,
      after: after!,
    });
    return after!;
  });
}

export async function assignTask(ctx: Ctx, id: string, assigneeId: string) {
  return command('tasks.assign', ctx, async (kit) => {
    const { task, participants } = await getTask(kit.tx, id);
    assertCan(ctx, 'tasks.edit', taskOwners(task, participants));
    await kit.tx.update(s.tasks).set({ assigneeId, updatedAt: new Date() }).where(eq(s.tasks.id, id));
    await kit.audit({
      action: 'task.assignee_changed',
      entityType: 'task',
      entityId: id,
      before: { assigneeId: task.assigneeId },
      after: { assigneeId },
    });
    await kit.emit({
      type: 'task.assigned',
      entityType: 'task',
      entityId: id,
      payload: { taskId: id, assigneeId },
    });
  });
}

export async function setTaskStatus(ctx: Ctx, id: string, status: Exclude<TaskStatus, 'blocked'>) {
  return command('tasks.setStatus', ctx, async (kit) => {
    const { tx } = kit;
    const { task, participants } = await getTask(tx, id);
    assertCan(ctx, 'tasks.edit', taskOwners(task, participants));
    if (task.status === 'blocked') throw badRequest('Desbloqueie a tarefa antes de mudar o status.');
    if (status === 'done' || status === 'in_progress') {
      const deps = await tx
        .select({ id: s.tasks.id, title: s.tasks.title })
        .from(s.taskDependencies)
        .innerJoin(s.tasks, eq(s.tasks.id, s.taskDependencies.dependsOnId))
        .where(and(eq(s.taskDependencies.taskId, id), notInArray(s.tasks.status, ['done', 'cancelled'])));
      if (deps.length) throw badRequest(`Depende de: ${deps.map((d) => d.title).join(', ')}`);
    }
    const now = new Date();
    const [after] = await tx
      .update(s.tasks)
      .set({ status, completedAt: status === 'done' ? now : null, updatedAt: now })
      .where(eq(s.tasks.id, id))
      .returning();
    if ((status === 'done' || status === 'cancelled') && task.slaClockId && !task.requestId)
      await stopClock(kit, task.slaClockId, now);
    await kit.audit({
      action: 'task.status_changed',
      entityType: 'task',
      entityId: id,
      before: { status: task.status },
      after: { status },
    });
    if (status === 'done')
      await kit.emit({ type: 'task.completed', entityType: 'task', entityId: id, payload: { taskId: id } });
    return after!;
  });
}

/** "Bloqueado por": motivo, quem resolve, início e observação. Pausa o SLA até desbloquear. */
export async function blockTask(
  ctx: Ctx,
  id: string,
  input: {
    reason: string;
    resolver: string;
    resolverMemberId?: string | null;
    external?: boolean;
    note?: string;
  },
) {
  if (!input.reason.trim() || !input.resolver.trim()) throw badRequest('Informe o motivo e quem resolve.');
  return command('tasks.block', ctx, async (kit) => {
    const { tx } = kit;
    const { task, participants } = await getTask(tx, id);
    assertCan(ctx, 'tasks.edit', taskOwners(task, participants));
    if (task.status === 'blocked') throw badRequest('A tarefa já está bloqueada.');
    if (task.status === 'done') throw badRequest('Tarefa concluída não pode ser bloqueada.');
    const now = new Date();
    await tx.insert(s.taskBlocks).values({
      workspaceId: ctx.workspaceId,
      taskId: id,
      reason: input.reason.trim(),
      resolver: input.resolver.trim(),
      resolverMemberId: input.resolverMemberId ?? null,
      external: input.external ?? false,
      note: input.note,
      startedAt: now,
      createdBy: ctx.memberId,
    });
    await tx.update(s.tasks).set({ status: 'blocked', updatedAt: now }).where(eq(s.tasks.id, id));
    if (task.slaClockId) await pauseClock(kit, task.slaClockId, 'blocked', input.reason, now);
    await kit.audit({
      action: 'task.blocked',
      entityType: 'task',
      entityId: id,
      before: { status: task.status },
      after: { status: 'blocked', reason: input.reason, resolver: input.resolver },
    });
    await kit.emit({
      type: 'task.blocked',
      entityType: 'task',
      entityId: id,
      payload: { taskId: id, reason: input.reason },
    });
  });
}

export async function unblockTask(ctx: Ctx, id: string) {
  return command('tasks.unblock', ctx, async (kit) => {
    const { tx } = kit;
    const { task, participants } = await getTask(tx, id);
    assertCan(ctx, 'tasks.edit', taskOwners(task, participants));
    if (task.status !== 'blocked') throw badRequest('A tarefa não está bloqueada.');
    const now = new Date();
    await tx
      .update(s.taskBlocks)
      .set({ endedAt: now })
      .where(and(eq(s.taskBlocks.taskId, id), isNull(s.taskBlocks.endedAt)));
    await tx.update(s.tasks).set({ status: 'in_progress', updatedAt: now }).where(eq(s.tasks.id, id));
    if (task.slaClockId) await resumeClock(kit, task.slaClockId, now);
    await kit.audit({
      action: 'task.unblocked',
      entityType: 'task',
      entityId: id,
      before: { status: 'blocked' },
      after: { status: 'in_progress' },
    });
    await kit.emit({ type: 'task.unblocked', entityType: 'task', entityId: id, payload: { taskId: id } });
  });
}

export async function commentTask(ctx: Ctx, id: string, body: string) {
  if (!body.trim()) throw badRequest('Comentário vazio.');
  return command('tasks.comment', ctx, async (kit) => {
    const { task, participants } = await getTask(kit.tx, id);
    assertCan(ctx, 'tasks.view', taskOwners(task, participants));
    await kit.tx
      .insert(s.taskComments)
      .values({ workspaceId: ctx.workspaceId, taskId: id, authorId: ctx.memberId, body: body.trim() });
    await kit.emit({ type: 'task.commented', entityType: 'task', entityId: id, payload: { taskId: id } });
  });
}

export type TaskView = 'today' | 'upcoming' | 'overdue' | 'done' | 'all';

function startOfDayLocal(tz: string, offsetDays = 0): Date {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  d.setHours(0, 0, 0, 0);
  const shift =
    new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(d.getTime() + shift + offsetDays * 86_400_000);
}

export async function listTasks(
  ctx: Ctx,
  opts: { view?: TaskView; clientId?: string; assigneeId?: string; mine?: boolean; limit?: number } = {},
) {
  assertCan(ctx, 'tasks.view');
  return read(ctx, async (tx) => {
    const now = new Date();
    const conds = [];
    const sc = scopeWhere(ctx, 'tasks.view', {
      client: s.tasks.clientId,
      owners: [s.tasks.assigneeId],
      ownerSql: [
        exists(
          tx
            .select({ x: sql`1` })
            .from(s.taskAssignees)
            .where(and(eq(s.taskAssignees.taskId, s.tasks.id), eq(s.taskAssignees.memberId, ctx.memberId))),
        ),
      ],
    });
    if (sc) conds.push(sc);
    if (opts.clientId) conds.push(eq(s.tasks.clientId, opts.clientId));
    if (opts.assigneeId) conds.push(eq(s.tasks.assigneeId, opts.assigneeId));
    if (opts.mine) conds.push(eq(s.tasks.assigneeId, ctx.memberId));
    const openStatus = notInArray(s.tasks.status, ['done', 'cancelled']);
    const endToday = startOfDayLocal(ctx.timezone, 1);
    switch (opts.view ?? 'all') {
      case 'today':
        conds.push(openStatus, gte(s.tasks.dueAt, now), lt(s.tasks.dueAt, endToday));
        break;
      case 'upcoming':
        conds.push(openStatus, or(gte(s.tasks.dueAt, endToday), isNull(s.tasks.dueAt))!);
        break;
      case 'overdue':
        conds.push(openStatus, lt(s.tasks.dueAt, now));
        break;
      case 'done':
        conds.push(eq(s.tasks.status, 'done'));
        break;
    }
    const rows = await tx
      .select({ t: s.tasks, client: s.clients.name, clientColor: s.clients.color, assignee: s.users.name })
      .from(s.tasks)
      .leftJoin(s.clients, eq(s.clients.id, s.tasks.clientId))
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.tasks.assigneeId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(and(...conds))
      .orderBy(opts.view === 'done' ? desc(s.tasks.completedAt) : asc(s.tasks.dueAt))
      .limit(opts.limit ?? 200);
    const sla = await liveStatuses(
      tx,
      rows.map((r) => r.t.slaClockId),
    );
    const blocks = rows.length
      ? await tx
          .select()
          .from(s.taskBlocks)
          .where(
            and(
              inArray(
                s.taskBlocks.taskId,
                rows.map((r) => r.t.id),
              ),
              isNull(s.taskBlocks.endedAt),
            ),
          )
      : [];
    return rows.map((r) => ({
      ...r.t,
      clientName: r.client,
      clientColor: r.clientColor,
      assigneeName: r.assignee,
      sla: r.t.slaClockId ? (sla.get(r.t.slaClockId) ?? null) : null,
      block: blocks.find((b) => b.taskId === r.t.id) ?? null,
      overdue: Boolean(r.t.dueAt && r.t.dueAt < now && r.t.status !== 'done' && r.t.status !== 'cancelled'),
    }));
  });
}

export async function taskCounts(ctx: Ctx, mine = false) {
  const views = ['today', 'upcoming', 'overdue', 'done'] as const;
  const res = await Promise.all(views.map((view) => listTasks(ctx, { view, mine, limit: 500 })));
  return Object.fromEntries(views.map((v, i) => [v, res[i]!.length])) as Record<
    (typeof views)[number],
    number
  >;
}

export async function getTaskDetail(ctx: Ctx, id: string) {
  assertCan(ctx, 'tasks.view');
  return read(ctx, async (tx) => {
    const { task, participants } = await getTask(tx, id);
    assertCan(ctx, 'tasks.view', taskOwners(task, participants));
    const comments = await tx
      .select({ c: s.taskComments, author: s.users.name })
      .from(s.taskComments)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.taskComments.authorId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.taskComments.taskId, id))
      .orderBy(asc(s.taskComments.createdAt));
    const blocks = await tx
      .select()
      .from(s.taskBlocks)
      .where(eq(s.taskBlocks.taskId, id))
      .orderBy(desc(s.taskBlocks.startedAt));
    const deps = await tx
      .select({ id: s.tasks.id, title: s.tasks.title, status: s.tasks.status })
      .from(s.taskDependencies)
      .innerJoin(s.tasks, eq(s.tasks.id, s.taskDependencies.dependsOnId))
      .where(eq(s.taskDependencies.taskId, id));
    const partNames = participants.length
      ? await tx
          .select({ id: s.workspaceMembers.id, name: s.users.name })
          .from(s.workspaceMembers)
          .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
          .where(inArray(s.workspaceMembers.id, participants))
      : [];
    const history = await tx
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityType, 'task'), eq(s.auditLogs.entityId, id)))
      .orderBy(desc(s.auditLogs.createdAt));
    const files = await tx
      .select({ f: s.files })
      .from(s.fileLinks)
      .innerJoin(s.files, eq(s.files.id, s.fileLinks.fileId))
      .where(
        and(eq(s.fileLinks.entityType, 'task'), eq(s.fileLinks.entityId, id), isNull(s.files.deletedAt)),
      );
    const sla = await liveStatuses(tx, [task.slaClockId]);
    const [client] = task.clientId
      ? await tx.select().from(s.clients).where(eq(s.clients.id, task.clientId))
      : [];
    return {
      task,
      client: client ?? null,
      participants: partNames,
      comments,
      blocks,
      dependencies: deps,
      history,
      files: files.map((f) => f.f),
      sla: task.slaClockId ? (sla.get(task.slaClockId) ?? null) : null,
      canEdit: can(ctx, 'tasks.edit', taskOwners(task, participants)),
    };
  });
}
