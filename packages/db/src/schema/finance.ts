import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { expenseKind, invoiceStatus, itemKind } from './enums';
import { clients, contracts } from './clients';
import { workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });
const cents = (n: string) => bigint(n, { mode: 'number' });

/** Cobranças. Competência (YYYY-MM) ≠ vencimento ≠ pagamento (os 5 conceitos não se misturam). */
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    contractId: uuid('contract_id'),
    number: text('number').notNull(),
    competence: text('competence').notNull(),
    kind: itemKind('kind').notNull(),
    description: text('description').notNull(),
    issueOn: date('issue_on').notNull(),
    dueOn: date('due_on').notNull(),
    amountCents: cents('amount_cents').notNull(),
    paidCents: cents('paid_cents').notNull().default(0),
    status: invoiceStatus('status').notNull().default('issued'),
    origin: text('origin').notNull().default('contract'),
    deletedAt: tstz('deleted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('invoices', t),
    unique('invoices_number').on(t.workspaceId, t.number),
    /** Geração idempotente: uma cobrança por contrato, competência e tipo. */
    unique('invoices_contract_competence').on(t.workspaceId, t.contractId, t.competence, t.kind),
    wsFk('invoices', t, t.clientId, clients),
    wsFk('invoices', t, t.contractId, contracts),
    index('invoices_receivable').on(t.workspaceId, t.status, t.dueOn),
    check('invoices_amount_positive', sql`amount_cents > 0`),
    check('invoices_paid_le_amount', sql`paid_cents >= 0 AND paid_cents <= amount_cents`),
  ],
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: id(),
    workspaceId: ws(),
    invoiceId: uuid('invoice_id').notNull(),
    description: text('description').notNull(),
    amountCents: cents('amount_cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('invoice_items', t), wsFk('invoice_items', t, t.invoiceId, invoices)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    workspaceId: ws(),
    invoiceId: uuid('invoice_id').notNull(),
    amountCents: cents('amount_cents').notNull(),
    paidOn: date('paid_on').notNull(),
    method: text('method'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('payments', t),
    wsFk('payments', t, t.invoiceId, invoices),
    check('payments_amount_positive', sql`amount_cents > 0`),
  ],
);

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    kind: expenseKind('kind').notNull().default('variable'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('expense_categories', t), unique('expense_categories_name').on(t.workspaceId, t.name)],
);

/** Despesa = conta a pagar enquanto paid_on é nulo. */
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    workspaceId: ws(),
    categoryId: uuid('category_id'),
    clientId: uuid('client_id'),
    description: text('description').notNull(),
    supplier: text('supplier'),
    amountCents: cents('amount_cents').notNull(),
    competence: text('competence').notNull(),
    dueOn: date('due_on').notNull(),
    paidOn: date('paid_on'),
    recurring: text('recurring'),
    deletedAt: tstz('deleted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('expenses', t),
    wsFk('expenses', t, t.categoryId, expenseCategories),
    wsFk('expenses', t, t.clientId, clients),
    check('expenses_amount_positive', sql`amount_cents > 0`),
  ],
);
