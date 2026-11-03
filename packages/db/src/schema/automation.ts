import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { executionStatus } from './enums';
import { workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });

/** QUANDO (trigger) → SE (conditions) → ENTÃO (actions). Regras são dados (V3, seção 9). */
export const automationRules = pgTable(
  'automation_rules',
  {
    id: id(),
    workspaceId: ws(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    trigger: text('trigger').notNull(),
    conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default({}),
    actions: jsonb('actions').$type<Record<string, unknown>[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('automation_rules', t), unique('automation_rules_key').on(t.workspaceId, t.key)],
);

/** Idempotência: uma execução bem-sucedida (ok/skipped) por (regra, evento); falhas ficam no histórico. */
export const automationExecutions = pgTable(
  'automation_executions',
  {
    id: id(),
    workspaceId: ws(),
    ruleId: uuid('rule_id').notNull(),
    eventId: uuid('event_id').notNull(),
    eventType: text('event_type').notNull(),
    status: executionStatus('status').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: text('error'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('automation_executions', t),
    uniqueIndex('automation_executions_once')
      .on(t.ruleId, t.eventId)
      .where(sql`status <> 'failed'`),
    wsFk('automation_executions', t, t.ruleId, automationRules),
  ],
);
