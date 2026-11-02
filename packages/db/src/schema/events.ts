import { integer, jsonb, pgTable, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, id, workspaceId } from './_shared';
import { actorType } from './enums';
import { workspaces } from './platform';

/** Outbox: gravado na MESMA transação da ação. O relay entrega ao Inngest. */
export const domainEvents = pgTable(
  'domain_events',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    version: integer('version').notNull().default(1),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: text('idempotency_key'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('domain_events_pending')
      .on(t.availableAt)
      .where(sql`processed_at IS NULL`),
    index('domain_events_entity').on(t.workspaceId, t.entityType, t.entityId),
    unique('domain_events_idem').on(t.workspaceId, t.idempotencyKey),
  ],
);

/** Auditoria de negócio. Somente inclusão (o papel da aplicação não tem UPDATE/DELETE). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    actorType: actorType('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_entity').on(t.workspaceId, t.entityType, t.entityId, t.createdAt)],
);
