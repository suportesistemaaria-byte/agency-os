import { date, index, numeric, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { clients } from './clients';
import { contents } from './content';
import { workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });

export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    platform: text('platform').notNull(),
    handle: text('handle').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('social_accounts', t),
    wsFk('social_accounts', t, t.clientId, clients),
    unique('social_accounts_handle').on(t.clientId, t.platform, t.handle),
  ],
);

/** Métrica (manual ou importada por CSV). content_id opcional: métrica do perfil ou de um conteúdo. */
export const performanceMetrics = pgTable(
  'performance_metrics',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    contentId: uuid('content_id'),
    platform: text('platform'),
    metric: text('metric').notNull(),
    value: numeric('value', { precision: 16, scale: 2 }).notNull(),
    date: date('date').notNull(),
    source: text('source').notNull().default('manual'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('performance_metrics', t),
    wsFk('performance_metrics', t, t.clientId, clients),
    wsFk('performance_metrics', t, t.contentId, contents),
    unique('performance_metrics_point').on(t.clientId, t.contentId, t.metric, t.date).nullsNotDistinct(),
    index('performance_metrics_client').on(t.workspaceId, t.clientId, t.date),
  ],
);

export const performanceGoals = pgTable(
  'performance_goals',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    metric: text('metric').notNull(),
    period: text('period').notNull(),
    target: numeric('target', { precision: 16, scale: 2 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('performance_goals', t),
    wsFk('performance_goals', t, t.clientId, clients),
    unique('performance_goals_period').on(t.clientId, t.metric, t.period),
  ],
);

/** Aprendizado: hipótese → validado/descartado, com evidência e confiança (V3, learnings). */
export const learnings = pgTable(
  'learnings',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id'),
    contentId: uuid('content_id'),
    title: text('title').notNull(),
    evidence: text('evidence'),
    confidence: text('confidence').notNull().default('medium'),
    status: text('status').notNull().default('hypothesis'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('learnings', t),
    wsFk('learnings', t, t.clientId, clients),
    wsFk('learnings', t, t.contentId, contents),
    index('learnings_client').on(t.workspaceId, t.clientId),
  ],
);
