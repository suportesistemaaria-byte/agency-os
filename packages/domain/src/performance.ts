import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { METRICS } from './labels';
export { METRICS };

export interface MetricInput {
  date: string;
  metric: string;
  value: number;
  contentId?: string | null;
  platform?: string | null;
}

function validate(rows: MetricInput[]) {
  for (const [i, r] of rows.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date)))
      throw badRequest(`Linha ${i + 1}: data inválida (use AAAA-MM-DD).`);
    if (!METRICS[r.metric]) throw badRequest(`Linha ${i + 1}: métrica desconhecida "${r.metric}".`);
    if (!Number.isFinite(r.value) || r.value < 0) throw badRequest(`Linha ${i + 1}: valor inválido.`);
  }
}

/** Grava métricas (upsert por cliente+conteúdo+métrica+data: reimportar o mesmo período corrige, não duplica). */
export async function recordMetrics(
  ctx: Ctx,
  clientId: string,
  rows: MetricInput[],
  source: 'manual' | 'csv' = 'manual',
) {
  assertCan(ctx, 'reports.view');
  assertCan(ctx, 'clientes.view', { clientId });
  if (!rows.length) throw badRequest('Nenhuma métrica para gravar.');
  validate(rows);
  return command('performance.record', ctx, async (kit) => {
    const contentIds = [...new Set(rows.map((r) => r.contentId).filter((x): x is string => Boolean(x)))];
    if (contentIds.length) {
      const owned = await kit.tx
        .select({ id: s.contents.id })
        .from(s.contents)
        .where(and(inArray(s.contents.id, contentIds), eq(s.contents.clientId, clientId)));
      if (owned.length !== contentIds.length) throw badRequest('Há conteúdos que não são deste cliente.');
    }
    for (const r of rows)
      await kit.tx
        .insert(s.performanceMetrics)
        .values({
          workspaceId: ctx.workspaceId,
          clientId,
          contentId: r.contentId ?? null,
          platform: r.platform ?? null,
          metric: r.metric,
          value: String(r.value),
          date: r.date,
          source,
          createdBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [
            s.performanceMetrics.clientId,
            s.performanceMetrics.contentId,
            s.performanceMetrics.metric,
            s.performanceMetrics.date,
          ],
          set: { value: String(r.value), source, platform: r.platform ?? null },
        });
    await kit.audit({
      action: 'metrics.imported',
      entityType: 'client',
      entityId: clientId,
      after: { rows: rows.length, source },
    });
    await kit.emit({
      type: 'metrics.imported',
      entityType: 'client',
      entityId: clientId,
      payload: { clientId, rows: rows.length, source },
    });
    return { rows: rows.length };
  });
}

/**
 * CSV: cabeçalho com data, metrica, valor e opcionalmente conteudo (título ou id) e plataforma.
 * Aceita vírgula ou ponto e vírgula; valores com vírgula decimal. Erros apontam a linha.
 */
export function parseMetricsCsv(text: string, contents: { id: string; title: string }[]): MetricInput[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) throw badRequest('O CSV precisa de cabeçalho e ao menos uma linha.');
  const sep = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const norm = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const head = lines[0]!.split(sep).map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = col('data', 'date');
  const iMetric = col('metrica', 'metric');
  const iValue = col('valor', 'value');
  const iContent = col('conteudo', 'content');
  const iPlatform = col('plataforma', 'platform');
  if (iDate < 0 || iMetric < 0 || iValue < 0) throw badRequest('Cabeçalho precisa de: data, metrica, valor.');
  const byTitle = new Map(contents.map((c) => [c.title.trim().toLowerCase(), c.id]));
  const byId = new Set(contents.map((c) => c.id));
  return lines.slice(1).map((line, i) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    let date = cells[iDate] ?? '';
    const br = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) date = `${br[3]}-${br[2]}-${br[1]}`;
    const raw = (cells[iValue] ?? '').replace(/\./g, '').replace(',', '.');
    const value = Number(
      sep === ';' || /,\d+$/.test(cells[iValue] ?? '') ? raw : (cells[iValue] ?? '').replace(/,/g, ''),
    );
    let contentId: string | null = null;
    const c = iContent >= 0 ? (cells[iContent] ?? '').trim() : '';
    if (c) {
      contentId = byId.has(c) ? c : (byTitle.get(c.toLowerCase()) ?? null);
      if (!contentId) throw badRequest(`Linha ${i + 2}: conteúdo "${c}" não encontrado neste cliente.`);
    }
    return {
      date,
      metric: norm(cells[iMetric] ?? ''),
      value,
      contentId,
      platform: iPlatform >= 0 ? cells[iPlatform] || null : null,
    };
  });
}

export async function importMetricsCsv(ctx: Ctx, clientId: string, csv: string) {
  assertCan(ctx, 'clientes.view', { clientId });
  const contents = await read(ctx, (tx) =>
    tx
      .select({ id: s.contents.id, title: s.contents.title })
      .from(s.contents)
      .where(eq(s.contents.clientId, clientId)),
  );
  const rows = parseMetricsCsv(csv, contents);
  return recordMetrics(ctx, clientId, rows, 'csv');
}

const monthOf = (d: string) => d.slice(0, 7);
const addMonths = (p: string, n: number) => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

type MetricRow = typeof s.performanceMetrics.$inferSelect;

/** Agrega por mês: soma para fluxo (alcance, curtidas…); último valor do mês para estoque (seguidores). */
export function aggregateMonthly(
  rows: Pick<MetricRow, 'metric' | 'value' | 'date' | 'contentId'>[],
  months: string[],
) {
  const out: Record<string, Record<string, number>> = {};
  for (const m of months) out[m] = {};
  // Totais do perfil vêm só das métricas sem conteúdo; as por conteúdo alimentam o ranking (sem dupla contagem).
  const profile = rows.filter((r) => !r.contentId);
  for (const r of [...profile].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = monthOf(r.date);
    if (!out[m]) continue;
    const v = Number(r.value);
    if (METRICS[r.metric]?.stock) out[m]![r.metric] = v;
    else out[m]![r.metric] = (out[m]![r.metric] ?? 0) + v;
  }
  for (const m of months)
    out[m]!.engagement = Object.entries(out[m]!)
      .filter(([k]) => METRICS[k]?.engagement)
      .reduce((a, [, v]) => a + v, 0);
  return out;
}

export async function performanceOverview(
  ctx: Ctx,
  opts: { clientId?: string; period?: string; months?: number } = {},
) {
  assertCan(ctx, 'reports.view');
  if (opts.clientId) assertCan(ctx, 'clientes.view', { clientId: opts.clientId });
  const period = opts.period ?? new Date().toISOString().slice(0, 7);
  const months = Array.from({ length: opts.months ?? 6 }, (_, i) =>
    addMonths(period, i - (opts.months ?? 6) + 1),
  );
  return read(ctx, async (tx) => {
    const conds = [
      gte(s.performanceMetrics.date, `${months[0]}-01`),
      lt(s.performanceMetrics.date, `${addMonths(period, 1)}-01`),
    ];
    if (opts.clientId) conds.push(eq(s.performanceMetrics.clientId, opts.clientId));
    const sc = scopeWhere(ctx, 'clientes.view', { client: s.performanceMetrics.clientId });
    if (sc) conds.push(sc);
    const rows = await tx
      .select()
      .from(s.performanceMetrics)
      .where(and(...conds));
    const monthly = aggregateMonthly(rows, months);
    const cur = monthly[period]!;
    const prev = monthly[addMonths(period, -1)] ?? {};
    const kpis = ['reach', 'engagement', 'followers', 'clicks', 'leads'].map((k) => ({
      metric: k,
      label: k === 'engagement' ? 'Engajamento' : METRICS[k]!.label,
      value: cur[k] ?? 0,
      previous: prev[k] ?? 0,
      delta: prev[k] ? ((cur[k] ?? 0) - prev[k]!) / prev[k]! : null,
    }));
    // Melhores conteúdos do período por engajamento (curtidas+comentários+compartilhamentos+salvamentos).
    const engagementKeys = Object.keys(METRICS).filter((k) => METRICS[k]!.engagement);
    const top = await tx
      .select({
        contentId: s.performanceMetrics.contentId,
        title: s.contents.title,
        clientName: s.clients.name,
        format: s.contents.format,
        engagement: sql<string>`sum(${s.performanceMetrics.value}) filter (where ${s.performanceMetrics.metric} in ${engagementKeys})`,
        reach: sql<string>`sum(${s.performanceMetrics.value}) filter (where ${s.performanceMetrics.metric} = 'reach')`,
      })
      .from(s.performanceMetrics)
      .innerJoin(s.contents, eq(s.contents.id, s.performanceMetrics.contentId))
      .innerJoin(s.clients, eq(s.clients.id, s.performanceMetrics.clientId))
      .where(
        and(
          ...conds,
          isNotNull(s.performanceMetrics.contentId),
          gte(s.performanceMetrics.date, `${addMonths(period, -2)}-01`),
        ),
      )
      .groupBy(s.performanceMetrics.contentId, s.contents.title, s.clients.name, s.contents.format)
      .orderBy(desc(sql`2`))
      .limit(8);
    const topSorted = top
      .map((t) => ({
        ...t,
        engagement: Number(t.engagement ?? 0),
        reach: Number(t.reach ?? 0),
        rate: Number(t.reach) ? Number(t.engagement ?? 0) / Number(t.reach) : null,
      }))
      .sort((a, b) => b.engagement - a.engagement);
    const goals = opts.clientId
      ? await tx
          .select()
          .from(s.performanceGoals)
          .where(and(eq(s.performanceGoals.clientId, opts.clientId), eq(s.performanceGoals.period, period)))
      : [];
    const goalProgress = goals.map((g) => {
      const actual = cur[g.metric] ?? 0;
      return {
        ...g,
        target: Number(g.target),
        actual,
        progress: Number(g.target) ? actual / Number(g.target) : 0,
      };
    });
    const learnings = await tx
      .select({ l: s.learnings, client: s.clients.name })
      .from(s.learnings)
      .leftJoin(s.clients, eq(s.clients.id, s.learnings.clientId))
      .where(
        opts.clientId
          ? eq(s.learnings.clientId, opts.clientId)
          : (scopeWhere(ctx, 'clientes.view', { client: s.learnings.clientId }) ?? undefined),
      )
      .orderBy(desc(s.learnings.updatedAt))
      .limit(30);
    return {
      period,
      months,
      monthly,
      kpis,
      top: topSorted,
      goals: goalProgress,
      learnings,
      hasData: rows.length > 0,
    };
  });
}

export async function setGoal(
  ctx: Ctx,
  input: { clientId: string; metric: string; period: string; target: number },
) {
  assertCan(ctx, 'reports.view');
  assertCan(ctx, 'clientes.edit', { clientId: input.clientId });
  if (!METRICS[input.metric] && input.metric !== 'engagement') throw badRequest('Métrica inválida.');
  if (!/^\d{4}-\d{2}$/.test(input.period) || !(input.target > 0))
    throw badRequest('Período (AAAA-MM) e meta positiva são obrigatórios.');
  return command('performance.setGoal', ctx, async (kit) => {
    await kit.tx
      .insert(s.performanceGoals)
      .values({
        workspaceId: ctx.workspaceId,
        clientId: input.clientId,
        metric: input.metric,
        period: input.period,
        target: String(input.target),
      })
      .onConflictDoUpdate({
        target: [s.performanceGoals.clientId, s.performanceGoals.metric, s.performanceGoals.period],
        set: { target: String(input.target), updatedAt: new Date() },
      });
    await kit.audit({ action: 'goal.set', entityType: 'client', entityId: input.clientId, after: input });
    await kit.emit({
      type: 'goal.set',
      entityType: 'client',
      entityId: input.clientId,
      payload: { clientId: input.clientId, metric: input.metric, period: input.period },
    });
  });
}

export async function addLearning(
  ctx: Ctx,
  input: {
    clientId?: string | null;
    contentId?: string | null;
    title: string;
    evidence?: string;
    confidence?: 'low' | 'medium' | 'high';
  },
) {
  assertCan(ctx, 'reports.view');
  if (input.clientId) assertCan(ctx, 'clientes.view', { clientId: input.clientId });
  if (!input.title.trim()) throw badRequest('Escreva o aprendizado.');
  return command('performance.addLearning', ctx, async (kit) => {
    const [l] = await kit.tx
      .insert(s.learnings)
      .values({
        workspaceId: ctx.workspaceId,
        clientId: input.clientId ?? null,
        contentId: input.contentId ?? null,
        title: input.title.trim(),
        evidence: input.evidence,
        confidence: input.confidence ?? 'medium',
        createdBy: ctx.userId,
      })
      .returning();
    await kit.emit({
      type: 'learning.created',
      entityType: 'learning',
      entityId: l!.id,
      payload: { learningId: l!.id },
    });
    return l!;
  });
}

export async function setLearningStatus(
  ctx: Ctx,
  id: string,
  status: 'hypothesis' | 'validated' | 'discarded',
) {
  assertCan(ctx, 'reports.view');
  return command('performance.learningStatus', ctx, async (kit) => {
    const [l] = await kit.tx.select().from(s.learnings).where(eq(s.learnings.id, id));
    const row = must(l);
    if (row.clientId) assertCan(ctx, 'clientes.view', { clientId: row.clientId });
    await kit.tx.update(s.learnings).set({ status, updatedAt: new Date() }).where(eq(s.learnings.id, id));
    await kit.audit({
      action: 'learning.status_changed',
      entityType: 'learning',
      entityId: id,
      before: { status: row.status },
      after: { status },
    });
  });
}

/** Resultados para o portal: só métricas e metas do próprio cliente (RLS do portal). */
export async function portalResults(
  ctx: Ctx & { clientId: string },
  period = new Date().toISOString().slice(0, 7),
) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(period, i - 5));
  return read(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(s.performanceMetrics)
      .where(
        and(
          eq(s.performanceMetrics.clientId, ctx.clientId),
          gte(s.performanceMetrics.date, `${months[0]}-01`),
          isNull(s.performanceMetrics.contentId),
        ),
      );
    const goals = await tx
      .select()
      .from(s.performanceGoals)
      .where(and(eq(s.performanceGoals.clientId, ctx.clientId), eq(s.performanceGoals.period, period)));
    const monthly = aggregateMonthly(rows, months);
    return {
      period,
      months,
      monthly,
      goals: goals.map((g) => ({ ...g, target: Number(g.target), actual: monthly[period]?.[g.metric] ?? 0 })),
    };
  });
}
