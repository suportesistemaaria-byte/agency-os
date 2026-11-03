import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { adminDb, appDb, schema as s, withTenant } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { assertCan, command, read, systemCtx, tenant, type Ctx } from './context';
import { badRequest, must } from './errors';
import { applyPayment, dueDateFor, financeSummary } from './finance-calc';
import { INVOICE_STATUS_LABEL } from './labels';
export { INVOICE_STATUS_LABEL };

const todayStr = () => new Date().toISOString().slice(0, 10);
const period = (d = new Date()) => d.toISOString().slice(0, 7);

async function nextInvoiceNumber(kit: CommandKit) {
  const [{ n }] = (await kit.tx.select({ n: sql<number>`count(*)::int` }).from(s.invoices)) as [
    { n: number },
  ];
  return `F-${String(n + 1).padStart(5, '0')}`;
}

/**
 * Gera as cobranças do contrato para a competência (idempotente pela UNIQUE contrato+competência+tipo).
 * Setup: só na competência de início. Recorrente: toda competência vigente.
 */
export async function generateInvoicesIn(kit: CommandKit, contractId: string, competence: string) {
  const { tx } = kit;
  const [ct] = await tx.select().from(s.contracts).where(eq(s.contracts.id, contractId));
  const contract = must(ct, 'Contrato não encontrado.');
  if (contract.status !== 'active') return [];
  if (
    contract.startOn.slice(0, 7) > competence ||
    (contract.endOn && contract.endOn.slice(0, 7) < competence)
  )
    return [];
  const items = await tx.select().from(s.contractItems).where(eq(s.contractItems.contractId, contractId));
  const created = [];
  for (const kind of ['setup', 'recurring'] as const) {
    const its = items.filter((i) => i.kind === kind);
    if (!its.length) continue;
    if (kind === 'setup' && contract.startOn.slice(0, 7) !== competence) continue;
    const exists = await tx
      .select({ id: s.invoices.id })
      .from(s.invoices)
      .where(
        and(
          eq(s.invoices.contractId, contractId),
          eq(s.invoices.competence, competence),
          eq(s.invoices.kind, kind),
        ),
      );
    if (exists.length) continue;
    const amount = its.reduce((a, i) => a + i.amountCents, 0);
    const dueOn =
      kind === 'setup'
        ? contract.startOn > dueDateFor(competence, contract.billingDay)
          ? contract.startOn
          : dueDateFor(competence, contract.billingDay)
        : dueDateFor(competence, contract.billingDay);
    const [inv] = await tx
      .insert(s.invoices)
      .values({
        workspaceId: kit.ctx.workspaceId,
        clientId: contract.clientId,
        contractId,
        number: await nextInvoiceNumber(kit),
        competence,
        kind,
        description:
          kind === 'setup' ? `Setup · ${contract.number}` : `Mensalidade ${competence} · ${contract.number}`,
        issueOn: todayStr(),
        dueOn,
        amountCents: amount,
        status: dueOn < todayStr() ? 'overdue' : 'issued',
        origin: 'contract',
      })
      .onConflictDoNothing()
      .returning();
    if (!inv) continue;
    await tx.insert(s.invoiceItems).values(
      its.map((i) => ({
        workspaceId: kit.ctx.workspaceId,
        invoiceId: inv.id,
        description: i.description,
        amountCents: i.amountCents,
      })),
    );
    await kit.audit({ action: 'invoice.created', entityType: 'invoice', entityId: inv.id, after: inv });
    await kit.emit({
      type: 'invoice.created',
      entityType: 'invoice',
      entityId: inv.id,
      payload: { invoiceId: inv.id, clientId: inv.clientId },
    });
    created.push(inv);
  }
  return created;
}

/** Financeiro confirma o contrato (decisão 5 da V3: faturas só depois da confirmação). */
export async function confirmContract(ctx: Ctx, contractId: string) {
  assertCan(ctx, 'financeiro.edit');
  return command('finance.confirmContract', ctx, async (kit) => {
    const [ct] = await kit.tx.select().from(s.contracts).where(eq(s.contracts.id, contractId));
    const contract = must(ct, 'Contrato não encontrado.');
    if (contract.status !== 'pending_finance_confirmation') throw badRequest('Contrato já confirmado.');
    const now = new Date();
    await kit.tx
      .update(s.contracts)
      .set({ status: 'active', confirmedAt: now, confirmedBy: ctx.memberId, updatedAt: now })
      .where(eq(s.contracts.id, contractId));
    await kit.audit({
      action: 'contract.confirmed',
      entityType: 'contract',
      entityId: contractId,
      before: { status: contract.status },
      after: { status: 'active' },
    });
    await kit.emit({
      type: 'contract.confirmed',
      entityType: 'contract',
      entityId: contractId,
      payload: { contractId, clientId: contract.clientId },
    });
  });
}

export async function recordPayment(
  ctx: Ctx,
  invoiceId: string,
  input: { amountCents: number; paidOn: string; method?: string; note?: string },
) {
  assertCan(ctx, 'financeiro.edit');
  return command('finance.recordPayment', ctx, async (kit) => {
    const { tx } = kit;
    await tx.execute(sql`select id from invoices where id = ${invoiceId} for update`);
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    const invoice = must(inv, 'Fatura não encontrada.');
    let next;
    try {
      next = applyPayment(invoice, input.amountCents, todayStr());
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const [p] = await tx
      .insert(s.payments)
      .values({
        workspaceId: ctx.workspaceId,
        invoiceId,
        amountCents: input.amountCents,
        paidOn: input.paidOn,
        method: input.method,
        note: input.note,
        createdBy: ctx.userId,
      })
      .returning();
    const [after] = await tx
      .update(s.invoices)
      .set({ paidCents: next.paidCents, status: next.status as 'paid', updatedAt: new Date() })
      .where(eq(s.invoices.id, invoiceId))
      .returning();
    await kit.audit({
      action: 'payment.recorded',
      entityType: 'invoice',
      entityId: invoiceId,
      before: { paidCents: invoice.paidCents, status: invoice.status },
      after: { paidCents: after!.paidCents, status: after!.status, amountCents: input.amountCents },
    });
    await kit.emit({
      type: 'payment.recorded',
      entityType: 'invoice',
      entityId: invoiceId,
      payload: { invoiceId, paymentId: p!.id, amountCents: input.amountCents },
    });
    if (next.status === 'paid')
      await kit.emit({
        type: 'invoice.paid',
        entityType: 'invoice',
        entityId: invoiceId,
        payload: { invoiceId },
      });
    return after!;
  });
}

export async function createInvoice(
  ctx: Ctx,
  input: { clientId: string; description: string; amountCents: number; dueOn: string; competence?: string },
) {
  assertCan(ctx, 'financeiro.edit');
  if (input.amountCents <= 0) throw badRequest('Valor precisa ser positivo.');
  return command('finance.createInvoice', ctx, async (kit) => {
    const [inv] = await kit.tx
      .insert(s.invoices)
      .values({
        workspaceId: ctx.workspaceId,
        clientId: input.clientId,
        number: await nextInvoiceNumber(kit),
        competence: input.competence ?? input.dueOn.slice(0, 7),
        kind: 'one_off',
        description: input.description,
        issueOn: todayStr(),
        dueOn: input.dueOn,
        amountCents: input.amountCents,
        origin: 'avulsa',
        createdBy: ctx.userId,
      })
      .returning();
    await kit.audit({ action: 'invoice.created', entityType: 'invoice', entityId: inv!.id, after: inv! });
    await kit.emit({
      type: 'invoice.created',
      entityType: 'invoice',
      entityId: inv!.id,
      payload: { invoiceId: inv!.id, clientId: input.clientId },
    });
    return inv!;
  });
}

export async function cancelInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  assertCan(ctx, 'financeiro.edit');
  if (reason.trim().length < 5) throw badRequest('Informe o motivo do cancelamento.');
  return command('finance.cancelInvoice', ctx, async (kit) => {
    const [inv] = await kit.tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    const invoice = must(inv);
    if (invoice.paidCents > 0) throw badRequest('Fatura com pagamento não pode ser cancelada.');
    await kit.tx
      .update(s.invoices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(s.invoices.id, invoiceId));
    await kit.audit({
      action: 'invoice.cancelled',
      entityType: 'invoice',
      entityId: invoiceId,
      before: { status: invoice.status },
      after: { status: 'cancelled' },
      metadata: { reason },
    });
  });
}

export async function createExpense(
  ctx: Ctx,
  input: {
    description: string;
    supplier?: string;
    categoryId?: string;
    amountCents: number;
    dueOn: string;
    competence?: string;
    paidOn?: string | null;
  },
) {
  assertCan(ctx, 'financeiro.edit');
  return command('finance.createExpense', ctx, async (kit) => {
    const [e] = await kit.tx
      .insert(s.expenses)
      .values({
        workspaceId: ctx.workspaceId,
        description: input.description,
        supplier: input.supplier,
        categoryId: input.categoryId,
        amountCents: input.amountCents,
        dueOn: input.dueOn,
        competence: input.competence ?? input.dueOn.slice(0, 7),
        paidOn: input.paidOn ?? null,
        createdBy: ctx.userId,
      })
      .returning();
    await kit.audit({ action: 'expense.created', entityType: 'expense', entityId: e!.id, after: e! });
    await kit.emit({
      type: 'expense.created',
      entityType: 'expense',
      entityId: e!.id,
      payload: { expenseId: e!.id },
    });
    return e!;
  });
}

export async function payExpense(ctx: Ctx, expenseId: string, paidOn: string) {
  assertCan(ctx, 'financeiro.edit');
  return command('finance.payExpense', ctx, async (kit) => {
    const [e] = await kit.tx.select().from(s.expenses).where(eq(s.expenses.id, expenseId));
    const exp = must(e);
    if (exp.paidOn) throw badRequest('Despesa já paga.');
    await kit.tx
      .update(s.expenses)
      .set({ paidOn, updatedAt: new Date() })
      .where(eq(s.expenses.id, expenseId));
    await kit.audit({
      action: 'payable.paid',
      entityType: 'expense',
      entityId: expenseId,
      before: { paidOn: null },
      after: { paidOn },
    });
    await kit.emit({
      type: 'payable.paid',
      entityType: 'expense',
      entityId: expenseId,
      payload: { expenseId },
    });
  });
}

/** Cron diário: marca atrasadas (dia seguinte ao vencimento) e emite invoice.overdue uma vez. */
export async function markOverdueInvoices(today = todayStr()) {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let n = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    await command('finance.markOverdue', ctx, async (kit) => {
      const rows = await kit.tx
        .update(s.invoices)
        .set({ status: 'overdue', updatedAt: new Date() })
        .where(and(inArray(s.invoices.status, ['issued', 'partially_paid']), lt(s.invoices.dueOn, today)))
        .returning();
      for (const inv of rows) {
        n++;
        await kit.emit({
          type: 'invoice.overdue',
          entityType: 'invoice',
          entityId: inv.id,
          payload: { invoiceId: inv.id, clientId: inv.clientId },
          idempotencyKey: `invoice.overdue:${inv.id}`,
        });
      }
    });
  }
  return n;
}

/** Cron mensal: gera as mensalidades da competência para todos os contratos vigentes. */
export async function monthlyBilling(competence = period()) {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let n = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    const contracts = await withTenant(appDb(), tenant(ctx), (tx) =>
      tx.select({ id: s.contracts.id }).from(s.contracts).where(eq(s.contracts.status, 'active')),
    );
    for (const c of contracts)
      n += (await command('finance.monthlyBilling', ctx, (kit) => generateInvoicesIn(kit, c.id, competence)))
        .length;
  }
  return n;
}

// ───────────────────────────── Leitura ─────────────────────────────

export async function financeOverview(ctx: Ctx, per = period()) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const opps = await tx
      .select({
        state: s.opportunities.state,
        mrrCents: s.opportunities.mrrCents,
        probability: s.pipelineStages.probability,
      })
      .from(s.opportunities)
      .innerJoin(s.pipelineStages, eq(s.pipelineStages.id, s.opportunities.stageId));
    const contracts = await tx.select().from(s.contracts).where(isNull(s.contracts.deletedAt));
    const items = await tx.select().from(s.contractItems);
    const invoices = await tx.select().from(s.invoices).where(isNull(s.invoices.deletedAt));
    const payments = await tx.select().from(s.payments);
    const expenses = await tx.select().from(s.expenses).where(isNull(s.expenses.deletedAt));
    const data = {
      opps,
      contracts: contracts.map((c) => ({ ...c, items: items.filter((i) => i.contractId === c.id) })),
      invoices,
      payments,
      expenses,
    };
    const summary = financeSummary(data, per, todayStr());
    // Série de 6 meses (receitas recebidas × despesas por competência).
    const months: string[] = [];
    const [y, m] = per.split('-').map(Number) as [number, number];
    for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
    const series = months.map((mm) => {
      const r = financeSummary(data, mm, todayStr());
      return { period: mm, receivedCents: r.receivedCents, expensesCents: r.expensesCents };
    });
    const clients = await tx.select({ id: s.clients.id, name: s.clients.name }).from(s.clients);
    const nameOf = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '';
    const upcoming = [
      ...invoices
        .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
        .map((i) => ({
          kind: 'in' as const,
          id: i.id,
          label: nameOf(i.clientId),
          sub: i.description,
          dueOn: i.dueOn,
          cents: i.amountCents - i.paidCents,
          overdue: i.dueOn < todayStr(),
        })),
      ...expenses
        .filter((e) => !e.paidOn)
        .map((e) => ({
          kind: 'out' as const,
          id: e.id,
          label: e.supplier ?? e.description,
          sub: e.description,
          dueOn: e.dueOn,
          cents: e.amountCents,
          overdue: e.dueOn < todayStr(),
        })),
    ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    return { period: per, summary, series, upcoming: upcoming.slice(0, 12) };
  });
}

export async function listInvoices(ctx: Ctx, opts: { clientId?: string; status?: string } = {}) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const conds = [isNull(s.invoices.deletedAt)];
    if (opts.clientId) conds.push(eq(s.invoices.clientId, opts.clientId));
    if (opts.status) conds.push(eq(s.invoices.status, opts.status as 'paid'));
    const rows = await tx
      .select({ i: s.invoices, client: s.clients.name })
      .from(s.invoices)
      .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
      .where(and(...conds))
      .orderBy(asc(s.invoices.dueOn));
    const pays = rows.length
      ? await tx
          .select()
          .from(s.payments)
          .where(
            inArray(
              s.payments.invoiceId,
              rows.map((r) => r.i.id),
            ),
          )
      : [];
    return rows.map((r) => ({
      ...r.i,
      clientName: r.client,
      payments: pays.filter((p) => p.invoiceId === r.i.id),
    }));
  });
}

export async function listExpenses(ctx: Ctx) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, (tx) =>
    tx
      .select({ e: s.expenses, category: s.expenseCategories.name, kind: s.expenseCategories.kind })
      .from(s.expenses)
      .leftJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
      .where(isNull(s.expenses.deletedAt))
      .orderBy(asc(s.expenses.dueOn)),
  );
}

export async function listExpenseCategories(ctx: Ctx) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, (tx) => tx.select().from(s.expenseCategories).orderBy(asc(s.expenseCategories.name)));
}

export async function listContracts(ctx: Ctx) {
  assertCan(ctx, 'financeiro.view');
  return read(ctx, async (tx) => {
    const rows = await tx
      .select({ c: s.contracts, client: s.clients.name })
      .from(s.contracts)
      .innerJoin(s.clients, eq(s.clients.id, s.contracts.clientId))
      .where(isNull(s.contracts.deletedAt))
      .orderBy(desc(s.contracts.createdAt));
    const items = rows.length
      ? await tx
          .select()
          .from(s.contractItems)
          .where(
            inArray(
              s.contractItems.contractId,
              rows.map((r) => r.c.id),
            ),
          )
      : [];
    return rows.map((r) => {
      const its = items.filter((i) => i.contractId === r.c.id);
      return {
        ...r.c,
        clientName: r.client,
        items: its,
        mrrCents: its.filter((i) => i.kind === 'recurring').reduce((a, i) => a + i.amountCents, 0),
        setupCents: its.filter((i) => i.kind === 'setup').reduce((a, i) => a + i.amountCents, 0),
      };
    });
  });
}
