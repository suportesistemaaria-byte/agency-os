import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, appDb, closeAll, schema as s, withTenant } from '@aos/db';
import {
  addLearning,
  importMetricsCsv,
  performanceOverview,
  portalResults,
  recordMetrics,
  setGoal,
} from './performance';
import { addContact } from './clients';
import { createContent } from './content';
import { loadPortalCtx } from './portal';
import { tenant, type Ctx } from './context';
import { clientIdByName, ctxOf, hasDb, uniq } from './test-helpers';

const db = () => adminDb();

describe.skipIf(!hasDb())('Bloco 11: performance', () => {
  let ctx: Ctx;
  let client = '';
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    client = await clientIdByName('Studio Nobre');
  });
  afterAll(closeAll);
  // período único por execução: o banco de teste acumula dados entre rodadas
  const year = 2040 + Math.floor(Math.random() * 400);
  const period = `${year}-05`;
  const prevPeriod = `${year}-04`;

  it('CSV reimportado corrige o valor em vez de duplicar', async () => {
    const c = await createContent(ctx, {
      clientId: client,
      title: uniq('Post perf'),
      platform: 'Instagram',
      format: 'Post',
    });
    await importMetricsCsv(
      ctx,
      client,
      `data;metrica;valor;conteudo\n${period}-03;reach;1000;\n${period}-03;likes;40;${c.title}`,
    );
    await importMetricsCsv(
      ctx,
      client,
      `data;metrica;valor;conteudo\n${period}-03;reach;1200;\n${period}-03;likes;40;${c.title}`,
    );
    const rows = await db()
      .select()
      .from(s.performanceMetrics)
      .where(and(eq(s.performanceMetrics.clientId, client), eq(s.performanceMetrics.date, `${period}-03`)));
    expect(rows).toHaveLength(2);
    expect(Number(rows.find((r) => r.metric === 'reach')!.value)).toBe(1200);
    expect(rows.every((r) => r.source === 'csv')).toBe(true);
  });

  it('não aceita métrica de conteúdo de outro cliente nem valor inválido', async () => {
    const other = await createContent(ctx, {
      clientId: await clientIdByName('Café Aurora'),
      title: uniq('Outro'),
      platform: 'Instagram',
      format: 'Post',
    });
    await expect(
      recordMetrics(ctx, client, [{ date: `${period}-04`, metric: 'likes', value: 1, contentId: other.id }]),
    ).rejects.toThrow(/não são deste cliente/);
    await expect(
      recordMetrics(ctx, client, [{ date: `${period}-04`, metric: 'xyz', value: 1 }]),
    ).rejects.toThrow(/desconhecida/);
    await expect(
      recordMetrics(ctx, client, [{ date: `${period}-04`, metric: 'reach', value: -5 }]),
    ).rejects.toThrow(/inválido/);
  });

  it('visão geral: KPIs com variação, metas com progresso e melhores conteúdos', async () => {
    await recordMetrics(ctx, client, [
      { date: `${prevPeriod}-10`, metric: 'reach', value: 600 },
      { date: `${period}-10`, metric: 'leads', value: 12 },
    ]);
    await setGoal(ctx, { clientId: client, metric: 'reach', period, target: 2400 });
    const o = await performanceOverview(ctx, { clientId: client, period });
    const reach = o.kpis.find((k) => k.metric === 'reach')!;
    expect(reach.value).toBe(1200);
    expect(reach.previous).toBe(600);
    expect(reach.delta).toBeCloseTo(1);
    expect(o.goals[0]).toMatchObject({ metric: 'reach', target: 2400, actual: 1200, progress: 0.5 });
    expect(o.top[0]!.engagement).toBe(40);
  });

  it('quem não tem reports.view não acessa; o portal vê resultados mas não aprendizados', async () => {
    await expect(performanceOverview(await ctxOf('rafa@demo.local'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await addLearning(ctx, {
      clientId: client,
      title: 'Carrossel educativo engaja 2× mais',
      evidence: 'Média de 3 meses',
      confidence: 'high',
    });
    const email = `${uniq('perf').replace(/\s/g, '')}@cliente.demo.local`;
    const ct = await addContact(ctx, client, { name: 'Contato perf', email });
    const [u] = await db().insert(s.users).values({ email, name: 'Contato perf' }).returning();
    await db().update(s.clientContacts).set({ userId: u!.id }).where(eq(s.clientContacts.id, ct.id));
    const p = (await loadPortalCtx(u!.id))!;
    const r = await portalResults(p, period);
    expect(r.monthly[period]!.reach).toBe(1200);
    expect(r.goals).toHaveLength(1);
    expect(await withTenant(appDb(), tenant(p), (tx) => tx.select().from(s.learnings))).toHaveLength(0);
    await expect(
      withTenant(appDb(), tenant(p), (tx) =>
        tx.insert(s.performanceMetrics).values({
          workspaceId: p.workspaceId,
          clientId: client,
          metric: 'reach',
          value: '1',
          date: `${year}-06-01`,
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
