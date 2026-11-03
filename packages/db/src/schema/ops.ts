import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { pauseKind, priority, requestStatus, requestType, slaStatus, taskStatus } from './enums';
import { clientContacts, clients } from './clients';
import { contents } from './content';
import { opportunities } from './crm';
import { workspaceMembers, workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });

// ── SLA persistido (V3, seção 8): o relógio guarda o snapshot da política. ──
export const slaClocks = pgTable(
  'sla_clocks',
  {
    id: id(),
    workspaceId: ws(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    policyKey: text('policy_key').notNull(),
    policySnapshot: jsonb('policy_snapshot').$type<Record<string, unknown>>().notNull(),
    createdFrom: tstz('created_from').notNull(),
    startAt: tstz('start_at').notNull(),
    dueAt: tstz('due_at'),
    status: slaStatus('status').notNull().default('on_time'),
    totalMinutes: integer('total_minutes').notNull(),
    consumedMinutes: integer('consumed_minutes').notNull().default(0),
    nearDueNotifiedAt: tstz('near_due_notified_at'),
    overdueNotifiedAt: tstz('overdue_notified_at'),
    stoppedAt: tstz('stopped_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('sla_clocks', t),
    index('sla_clocks_entity').on(t.workspaceId, t.entityType, t.entityId),
    index('sla_clocks_active')
      .on(t.workspaceId, t.status, t.dueAt)
      .where(sql`status IN ('on_time','near_due')`),
  ],
);

export const slaIntervals = pgTable(
  'sla_intervals',
  {
    id: id(),
    workspaceId: ws(),
    clockId: uuid('clock_id').notNull(),
    kind: pauseKind('kind').notNull(),
    reason: text('reason'),
    startedAt: tstz('started_at').notNull(),
    endedAt: tstz('ended_at'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('sla_intervals', t), wsFk('sla_intervals', t, t.clockId, slaClocks)],
);

export const slaOverrides = pgTable(
  'sla_overrides',
  {
    id: id(),
    workspaceId: ws(),
    clockId: uuid('clock_id').notNull(),
    beforeDue: tstz('before_due'),
    afterDue: tstz('after_due').notNull(),
    reason: text('reason').notNull(),
    actorId: uuid('actor_id'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('sla_overrides', t), wsFk('sla_overrides', t, t.clockId, slaClocks)],
);

export const requests = pgTable(
  'requests',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    type: requestType('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: requestStatus('status').notNull().default('received'),
    origin: text('origin').notNull().default('internal'),
    inScope: boolean('in_scope').notNull().default(true),
    urgent: boolean('urgent').notNull().default(false),
    assigneeId: uuid('assignee_id'),
    requestedByContactId: uuid('requested_by_contact_id'),
    slaClockId: uuid('sla_clock_id'),
    deliveredAt: tstz('delivered_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('requests', t),
    wsFk('requests', t, t.clientId, clients),
    wsFk('requests', t, t.assigneeId, workspaceMembers),
    wsFk('requests', t, t.requestedByContactId, clientContacts),
    wsFk('requests', t, t.slaClockId, slaClocks),
    index('requests_status').on(t.workspaceId, t.status),
  ],
);

export const requestStatusHistory = pgTable(
  'request_status_history',
  {
    id: id(),
    workspaceId: ws(),
    requestId: uuid('request_id').notNull(),
    fromStatus: requestStatus('from_status'),
    toStatus: requestStatus('to_status').notNull(),
    actorId: uuid('actor_id'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('request_status_history', t), wsFk('request_status_history', t, t.requestId, requests)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id'),
    requestId: uuid('request_id'),
    contentId: uuid('content_id'),
    opportunityId: uuid('opportunity_id'),
    /** Origem polimórfica: manual, request, content_change, onboarding, meeting, automation… */
    originType: text('origin_type').notNull().default('manual'),
    originId: uuid('origin_id'),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: uuid('assignee_id'),
    priority: priority('priority').notNull().default('normal'),
    status: taskStatus('status').notNull().default('todo'),
    dueAt: tstz('due_at'),
    slaClockId: uuid('sla_clock_id'),
    completedAt: tstz('completed_at'),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('tasks', t),
    wsFk('tasks', t, t.clientId, clients),
    wsFk('tasks', t, t.requestId, requests),
    wsFk('tasks', t, t.contentId, contents),
    wsFk('tasks', t, t.opportunityId, opportunities),
    wsFk('tasks', t, t.assigneeId, workspaceMembers),
    wsFk('tasks', t, t.slaClockId, slaClocks),
    index('tasks_today').on(t.workspaceId, t.assigneeId, t.status, t.dueAt),
    index('tasks_client').on(t.workspaceId, t.clientId, t.status),
    index('tasks_idem')
      .on(t.workspaceId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  ],
);

/** Participantes da tarefa. */
export const taskAssignees = pgTable(
  'task_assignees',
  {
    workspaceId: ws(),
    taskId: uuid('task_id').notNull(),
    memberId: uuid('member_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.memberId] }),
    wsFk('task_assignees', t, t.taskId, tasks),
    wsFk('task_assignees', t, t.memberId, workspaceMembers),
  ],
);

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    workspaceId: ws(),
    taskId: uuid('task_id').notNull(),
    dependsOnId: uuid('depends_on_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    wsFk('task_dependencies', t, t.taskId, tasks),
    wsFk('task_dependencies', t, t.dependsOnId, tasks),
  ],
);

/** "Bloqueado por": motivo, quem resolve, início, fim, observação. */
export const taskBlocks = pgTable(
  'task_blocks',
  {
    id: id(),
    workspaceId: ws(),
    taskId: uuid('task_id').notNull(),
    reason: text('reason').notNull(),
    resolver: text('resolver').notNull(),
    resolverMemberId: uuid('resolver_member_id'),
    external: boolean('external').notNull().default(false),
    note: text('note'),
    startedAt: tstz('started_at').notNull().defaultNow(),
    endedAt: tstz('ended_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('task_blocks', t),
    wsFk('task_blocks', t, t.taskId, tasks),
    wsFk('task_blocks', t, t.resolverMemberId, workspaceMembers),
  ],
);

export const taskComments = pgTable(
  'task_comments',
  {
    id: id(),
    workspaceId: ws(),
    taskId: uuid('task_id').notNull(),
    authorId: uuid('author_id'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('task_comments', t),
    wsFk('task_comments', t, t.taskId, tasks),
    wsFk('task_comments', t, t.authorId, workspaceMembers),
  ],
);

export const meetings = pgTable(
  'meetings',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id'),
    opportunityId: uuid('opportunity_id'),
    title: text('title').notNull(),
    startsAt: tstz('starts_at').notNull(),
    endsAt: tstz('ends_at'),
    location: text('location'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('meetings', t),
    wsFk('meetings', t, t.clientId, clients),
    wsFk('meetings', t, t.opportunityId, opportunities),
    index('meetings_day').on(t.workspaceId, t.startsAt),
  ],
);

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    workspaceId: ws(),
    meetingId: uuid('meeting_id').notNull(),
    memberId: uuid('member_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.memberId] }),
    wsFk('meeting_participants', t, t.meetingId, meetings),
    wsFk('meeting_participants', t, t.memberId, workspaceMembers),
  ],
);
