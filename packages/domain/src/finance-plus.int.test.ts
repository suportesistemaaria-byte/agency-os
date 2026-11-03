import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import { confirmContract, createExpense, createInvoice } from './finance';
import { applyAmendment, cashFlow, delinquency, generateRecurringExpenses } from './finance-plus';
import { createClientOpportunity, createProposal, decideProposal, markWon, sendProposal } from './crm';
import { drainOutbox } from './dispatcher';
import type { Ctx } from './context';
import { ctxOf, hasDb, uniq } from './test-helpers';
import { convertedClient } from './flows.int-helpers';

const db = () => adminDb();
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe.skipIf(!hasDb())('Bloco 8: financeiro completo', () => {
  let ctx: Ctx;
  let lia: Ctx;
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    lia = await ctxOf('lia@demo.local');
  });
  afterAll(closeAll);

  async function wonClientOpp(clientId: string, type: 'upsell' | 'renewal', mrr: number, setup = 0) {
    const o = await createClientOpportunity(ctx, {
      clientId,
      type,
      title: uniq(type === 'upsell' ? 'Upsell' : 'Renovação'),
      mrrCents: mrr,
    });
    const p = await createProposal(ctx, o.id, {
      title: 'Aditivo',
      items: [
        { description: 'Tráfego pago', kind: 'recurring', quantity: 1, unitCents: mrr },
        ...(setup ? [{ description: 'Setup', kind: 'setup' as const, quantity: 1, unitCents: setup }] : []),
      ],
    });
    await sendProposal(ctx, p.id);
    await decideProposal(ctx, p.id, 'accepted');
    await markWon(ctx, o.id);
    return o;
  }

  it('upsell ganho vira aditivo: novos itens no contrato vigente, setup cobrado, idempotente', async () => {
    const c = await convertedClient(ctx);
    const o = await wonClientOpp(c.clientId, 'upsell', 150_000, 50_000);
    await expect(applyAmendment(ctx, o.id)).rejects.toThrow(/vigente/); // contrato ainda aguarda o Financeiro
    await confirmContract(lia, c.contractId!);
    await drainOutbox();
    const r1 = await applyAmendment(ctx, o.id);
    const r2 = await applyAmendment(ctx, o.id);
    expect(r1.created).toBe(true);
    expect(r2).toEqual({ amendmentId: r1.amendmentId, created: false });
    const items = await db()
      .select()
      .from(s.contractItems)
      .where(eq(s.contractItems.contractId, c.contractId!));
    expect(items.filter((i) => i.kind === 'recurring').reduce((a, i) => a + i.amountCents, 0)).toBe(
      500_000 + 150_000,
    );
    expect(items.filter((i) => i.amendmentId === r1.amendmentId)).toHaveLength(2);
    const [am] = await db()
      .select()
      .from(s.contractAmendments)
      .where(eq(s.contractAmendments.id, r1.amendmentId));
    expect(am).toMatchObject({ kind: 'upsell', mrrDeltaCents: 150_000, setupCents: 50_000 });
    const setupInv = (await db().select().from(s.invoices).where(eq(s.invoices.clientId, c.clientId))).filter(
      (i) => i.description.startsWith('Setup do aditivo'),
    );
    expect(setupInv).toHaveLength(1);
    const [opp] = await db().select().from(s.opportunities).where(eq(s.opportunities.id, o.id));
    expect(opp!.convertedClientId).toBe(c.clientId);
    // aditivo é registro-prova: a aplicação não altera
    await expect(
      db().execute(sql`set role aos_app; update contract_amendments set description = 'x'`),
    ).rejects.toThrow();
    await db().execute(sql`reset role`);
  });

  it('renovação estende a vigência em 12 meses e guarda a anterior', async () => {
    const c = await convertedClient(ctx);
    await confirmContract(lia, c.contractId!);
    const [before] = await db().select().from(s.contracts).where(eq(s.contracts.id, c.contractId!));
    const o = await wonClientOpp(c.clientId, 'renewal', 500_000);
    const r = await applyAmendment(ctx, o.id);
    const [after] = await db().select().from(s.contracts).where(eq(s.contracts.id, c.contractId!));
    const [am] = await db()
      .select()
      .from(s.contractAmendments)
      .where(eq(s.contractAmendments.id, r.amendmentId));
    expect(am!.previousEndOn).toBe(before!.endOn);
    expect(Date.parse(after!.endOn!) - Date.parse(before!.endOn!)).toBe(365 * 86_400_000);
  });

  it('despesa mensal gera a da competência seguinte uma única vez', async () => {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 12));
    const desc = uniq('Assinatura recorrente');
    await createExpense(lia, {
      description: desc,
      supplier: 'Fornecedor X',
      amountCents: 9_900,
      dueOn: iso(prev),
      paidOn: iso(prev),
      recurring: 'monthly',
    });
    const cur = iso(now).slice(0, 7);
    await generateRecurringExpenses(cur);
    await generateRecurringExpenses(cur);
    const rows = await db()
      .select()
      .from(s.expenses)
      .where(and(eq(s.expenses.description, desc), eq(s.expenses.competence, cur)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amountCents: 9_900,
      paidOn: null,
      recurring: 'monthly',
      dueOn: `${cur}-12`,
    });
  });

  it('inadimplência por faixa de atraso e projeção de caixa coerentes com o em aberto', async () => {
    const c = await convertedClient(ctx);
    const due = iso(new Date(Date.now() - 45 * 86_400_000));
    await createInvoice(lia, {
      clientId: c.clientId,
      description: 'Avulsa vencida',
      amountCents: 77_700,
      dueOn: due,
    });
    const d = await delinquency(lia);
    const row = d.clients.find((x) => x.clientId === c.clientId)!;
    expect(row.buckets.d31_60).toBe(77_700);
    expect(row.oldestDays).toBe(45);
    expect(d.totals.totalCents).toBe(d.clients.reduce((a, x) => a + x.totalCents, 0));
    const cf = await cashFlow(lia, { weeks: 520 });
    const open = await db().execute<{ v: string }>(sql`
      select coalesce(sum(amount_cents - paid_cents),0) as v from invoices
      where workspace_id = ${lia.workspaceId} and deleted_at is null and status in ('issued','partially_paid','overdue')`);
    expect(cf.projected.reduce((a, w) => a + w.inCents, 0)).toBe(Number(open.rows[0]!.v));
    expect(cf.overdueInCents).toBeGreaterThanOrEqual(77_700);
  });

  it('designer não acessa os relatórios financeiros', async () => {
    const rafa = await ctxOf('rafa@demo.local');
    await expect(delinquency(rafa)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(cashFlow(rafa)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
