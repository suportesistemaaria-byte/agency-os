import { boolean, date, integer, jsonb, numeric, pgTable, text, unique } from 'drizzle-orm/pg-core';
import type { Period, Weekday } from '@aos/sla';
import { createdAt, id, updatedAt, workspaceId } from './_shared';
import { holidayKind, slaModel } from './enums';
import { workspaces } from './platform';

export const businessCalendars = pgTable(
  'business_calendars',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    periods: jsonb('periods').$type<Partial<Record<Weekday, Period[]>>>().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('business_calendars_ws_id').on(t.workspaceId, t.id)],
);

export const holidays = pgTable(
  'holidays',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    name: text('name').notNull(),
    kind: holidayKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('holidays_ws_date').on(t.workspaceId, t.date)],
);

export const slaPolicies = pgTable(
  'sla_policies',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    model: slaModel('model').notNull(),
    amount: integer('amount').notNull(),
    rule: text('rule'),
    nearDueRatio: numeric('near_due_ratio', { precision: 4, scale: 3 }).notNull().default('0.250'),
    nearDueMinMinutes: integer('near_due_min_minutes').notNull().default(120),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('sla_policies_ws_key').on(t.workspaceId, t.key), unique('sla_policies_ws_id').on(t.workspaceId, t.id)],
);
