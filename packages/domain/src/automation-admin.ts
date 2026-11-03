import { and, desc, eq, sql } from 'drizzle-orm';
import { adminDb, appDb, schema as s, withTenant } from '@aos/db';
import type { ClaimedEvent } from '@aos/events';
import { assertCan, command, read, systemCtx, tenant, type Ctx } from './context';
import { must } from './errors';
import { handleEvent } from './automation';

export async function listRules(ctx: Ctx) {
  assertCan(ctx, 'settings.manage');
  return read(ctx, async (tx) => {
    const rules = await tx.select().from(s.automationRules).orderBy(s.automationRules.name);
    const stats = await tx
      .select({
        ruleId: s.automationExecutions.ruleId,
        ok: sql<number>`count(*) filter (where ${s.automationExecutions.status} = 'ok')::int`,
        skipped: sql<number>`count(*) filter (where ${s.automationExecutions.status} = 'skipped')::int`,
        failed: sql<number>`count(*) filter (where ${s.automationExecutions.status} = 'failed')::int`,
        last: sql<Date>`max(${s.automationExecutions.createdAt})`,
      })
      .from(s.automationExecutions)
      .groupBy(s.automationExecutions.ruleId);
    return rules.map((r) => ({
      ...r,
      stats: stats.find((x) => x.ruleId === r.id) ?? { ok: 0, skipped: 0, failed: 0, last: null },
    }));
  });
}

/** Na fase 1 as regras são editáveis por ativação (V3, seção 9). */
export async function setRuleActive(ctx: Ctx, ruleId: string, active: boolean) {
  assertCan(ctx, 'settings.manage');
  return command('automation.setActive', ctx, async (kit) => {
    const [r] = await kit.tx.select().from(s.automationRules).where(eq(s.automationRules.id, ruleId));
    const rule = must(r);
    await kit.tx
      .update(s.automationRules)
      .set({ active, updatedAt: new Date() })
      .where(eq(s.automationRules.id, ruleId));
    await kit.audit({
      action: 'automation.toggled',
      entityType: 'automation_rule',
      entityId: ruleId,
      before: { active: rule.active },
      after: { active },
    });
  });
}

export async function listExecutions(
  ctx: Ctx,
  opts: { status?: 'ok' | 'skipped' | 'failed'; ruleId?: string; limit?: number } = {},
) {
  assertCan(ctx, 'settings.manage');
  return read(ctx, (tx) => {
    const conds = [];
    if (opts.status) conds.push(eq(s.automationExecutions.status, opts.status));
    if (opts.ruleId) conds.push(eq(s.automationExecutions.ruleId, opts.ruleId));
    return tx
      .select({ e: s.automationExecutions, rule: s.automationRules.name })
      .from(s.automationExecutions)
      .innerJoin(s.automationRules, eq(s.automationRules.id, s.automationExecutions.ruleId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.automationExecutions.createdAt))
      .limit(opts.limit ?? 100);
  });
}

/** Reprocessa um evento (falhas da dead-letter): seguro porque cada (regra, evento) só executa uma vez. */
export async function retryEvent(ctx: Ctx, eventId: string) {
  assertCan(ctx, 'settings.manage');
  const ev = await withTenant(
    appDb(),
    tenant(ctx),
    async (tx) => (await tx.select().from(s.domainEvents).where(eq(s.domainEvents.id, eventId)))[0],
  );
  const e = must(ev, 'Evento não encontrado.');
  const claimed: ClaimedEvent = {
    id: e.id,
    workspace_id: e.workspaceId,
    type: e.type,
    version: e.version,
    entity_type: e.entityType,
    entity_id: e.entityId,
    actor_type: e.actorType,
    actor_id: e.actorId,
    payload: e.payload,
    occurred_at: e.occurredAt.toISOString(),
    attempts: e.attempts,
    depth: e.depth,
  };
  return handleEvent(claimed);
}

const THRESHOLDS = [90, 60, 30, 15, 7] as const;

/**
 * Cron diário: emite contract.expiring nos marcos 90/60/30/15/7 dias (V3), uma única vez por contrato e marco.
 * Se o cron ficar parado, o marco atual ainda é emitido (faixa, não dia exato).
 */
export async function checkExpiringContracts(today = new Date().toISOString().slice(0, 10)) {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let n = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    n += await command('contracts.expiringCheck', ctx, async (kit) => {
      const rows = await kit.tx
        .select()
        .from(s.contracts)
        .where(
          and(
            eq(s.contracts.status, 'active'),
            sql`${s.contracts.endOn} is not null`,
            sql`${s.contracts.endOn} - ${today}::date between 0 and 90`,
          ),
        );
      let emitted = 0;
      for (const c of rows) {
        const daysLeft = Math.round((Date.parse(c.endOn!) - Date.parse(today)) / 86_400_000);
        const mark = [...THRESHOLDS].reverse().find((t) => daysLeft <= t)!;
        const id = await kit.emit({
          type: 'contract.expiring',
          entityType: 'contract',
          entityId: c.id,
          payload: { contractId: c.id, clientId: c.clientId, daysLeft },
          idempotencyKey: `contract.expiring:${c.id}:${mark}`,
        });
        if (id !== 'duplicate') emitted++;
      }
      return emitted;
    });
  }
  return n;
}
