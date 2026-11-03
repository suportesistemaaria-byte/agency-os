import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { adminDb, appDb, closeAll, schema as s, withTenant } from '@aos/db';
import { confirmContract, financeOverview, recordPayment } from './finance';
import { drainOutbox } from './dispatcher';
import { tenant, type Ctx } from './context';
import { ctxOf, hasDb } from './test-helpers';
import { convertedClient } from './flows.int-helpers';

const db = () => adminDb();
const today = () => new Date().toISOString().slice(0, 10);

describe.skipIf(!hasDb())('financeiro básico: contrato → faturas → pagamentos', () => {
  let ctx: Ctx;
  let lia: Ctx;
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    lia = await ctxOf('lia@demo.local');
  });
  afterAll(closeAll);

  it('só o Financeiro confirma; a confirmação gera setup + mensalidade (idempotente)', async () => {
    const c = await convertedClient(ctx);
    await expect(confirmContract(await ctxOf('leo@demo.local'), c.contractId!)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await confirmContract(lia, c.contractId!);
    await drainOutbox();
    await drainOutbox();
    const inv = await db().select().from(s.invoices).where(eq(s.invoices.contractId, c.contractId!));
    expect(inv.map((i) => [i.kind, i.amountCents]).sort()).toEqual([
      ['recurring', 500_000],
      ['setup', 120_000],
    ]);
    await expect(confirmContract(lia, c.contractId!)).rejects.toThrow(/já confirmado/);
  });

  it('pagamento parcial, quitação e nunca acima do saldo (serviço + trigger no banco)', async () => {
    const c = await convertedClient(ctx);
    await confirmContract(lia, c.contractId!);
    await drainOutbox();
    const [inv] = await db()
      .select()
      .from(s.invoices)
      .where(eq(s.invoices.contractId, c.contractId!))
      .then((r) => r.filter((i) => i.kind === 'recurring'));
    const p1 = await recordPayment(lia, inv!.id, { amountCents: 200_000, paidOn: today() });
    expect(p1).toMatchObject({ paidCents: 200_000 });
    expect(['partially_paid', 'overdue']).toContain(p1.status);
    await expect(recordPayment(lia, inv!.id, { amountCents: 300_001, paidOn: today() })).rejects.toThrow(
      /acima/,
    );
    // mesmo burlando o serviço, o banco recusa
    await expect(
      withTenant(appDb(), tenant(lia), (tx) =>
        tx.insert(s.payments).values({
          workspaceId: lia.workspaceId,
          invoiceId: inv!.id,
          amountCents: 300_001,
          paidOn: today(),
        }),
      ),
    ).rejects.toThrow(/ultrapassam/);
    const p2 = await recordPayment(lia, inv!.id, { amountCents: 300_000, paidOn: today() });
    expect(p2).toMatchObject({ paidCents: 500_000, status: 'paid' });
    const pays = await db().select().from(s.payments).where(eq(s.payments.invoiceId, inv!.id));
    expect(pays.reduce((a, p) => a + p.amountCents, 0)).toBe(500_000);
    // pagamentos são somente inclusão para a aplicação
    await expect(
      withTenant(appDb(), tenant(lia), (tx) =>
        tx.execute(sql`update payments set amount_cents = 1 where id = ${pays[0]!.id}`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('designer não vê o financeiro; o Financeiro vê os 5 conceitos separados', async () => {
    await expect(financeOverview(await ctxOf('rafa@demo.local'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const f = await financeOverview(lia);
    const v = f.summary;
    expect(v.pipelineCents).toBeGreaterThan(0);
    expect(v.mrrCents).toBeGreaterThan(0);
    // contratado = Σ itens recorrentes vigentes + setup do mês: confere com o banco, sem nada do pipeline
    const month = new Date().toISOString().slice(0, 7);
    const rows = await adminDb().execute<{ v: string }>(sql`
      select coalesce(sum(i.amount_cents),0) as v from contract_items i join contracts c on c.id = i.contract_id
      where c.workspace_id = ${lia.workspaceId} and c.status = 'active' and c.start_on <= (date_trunc('month', now()) + interval '1 month - 1 day')::date
        and (c.end_on is null or c.end_on >= date_trunc('month', now())::date)
        and (i.kind = 'recurring' or (i.kind = 'setup' and to_char(c.start_on, 'YYYY-MM') = ${month}))`);
    expect(v.contractedCents).toBe(Number(rows.rows[0]!.v));
    const inv = await adminDb().execute<{ v: string }>(sql`
      select coalesce(sum(amount_cents),0) as v from invoices where workspace_id = ${lia.workspaceId} and competence = ${month} and status not in ('cancelled','draft')`);
    expect(v.invoicedCents).toBe(Number(inv.rows[0]!.v));
    const rec = await adminDb().execute<{ v: string }>(sql`
      select coalesce(sum(amount_cents),0) as v from payments where workspace_id = ${lia.workspaceId} and to_char(paid_on, 'YYYY-MM') = ${month}`);
    expect(v.receivedCents).toBe(Number(rec.rows[0]!.v));
    const pipe = await adminDb().execute<{ v: string }>(sql`
      select coalesce(sum(mrr_cents),0) as v from opportunities where workspace_id = ${lia.workspaceId} and state = 'open'`);
    expect(v.pipelineCents).toBe(Number(pipe.rows[0]!.v));
  });
});
