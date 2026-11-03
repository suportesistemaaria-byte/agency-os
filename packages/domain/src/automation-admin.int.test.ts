import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import type { ClaimedEvent } from '@aos/events';
import { confirmContract } from './finance';
import { drainOutbox } from './dispatcher';
import { conditionsMatch, handleEvent } from './automation';
import {
  checkExpiringContracts,
  listExecutions,
  listRules,
  retryEvent,
  setRuleActive,
} from './automation-admin';
import { setPreference } from './notifications';
import { createTask } from './tasks';
import type { Ctx } from './context';
import { ctxOf, hasDb, uniq } from './test-helpers';
import { convertedClient } from './flows.int-helpers';

const db = () => adminDb();
const claimed = (e: typeof s.domainEvents.$inferSelect): ClaimedEvent => ({
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
});

describe.skipIf(!hasDb())('Bloco 12: automações', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
  });
  afterAll(closeAll);

  it('condições simples sobre o payload', () => {
    expect(conditionsMatch({ daysLeft: { lte: 90 } }, { daysLeft: 60 })).toBe(true);
    expect(conditionsMatch({ daysLeft: { lte: 90 } }, { daysLeft: 120 })).toBe(false);
    expect(conditionsMatch({ type: { in: ['video', 'arte_estatica'] } }, { type: 'video' })).toBe(true);
    expect(conditionsMatch({}, {})).toBe(true);
  });

  it('contract.expiring: um evento por marco e uma única oportunidade de renovação', async () => {
    const c = await convertedClient(ctx);
    await confirmContract(await ctxOf('lia@demo.local'), c.contractId!);
    const end = new Date(Date.now() + 80 * 86_400_000).toISOString().slice(0, 10);
    await db().update(s.contracts).set({ endOn: end }).where(eq(s.contracts.id, c.contractId!));
    await checkExpiringContracts();
    await checkExpiringContracts();
    const evs = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'contract.expiring'))
    ).filter((e) => e.entityId === c.contractId);
    expect(evs).toHaveLength(1);
    expect((evs[0]!.payload as { daysLeft: number }).daysLeft).toBe(80);
    await drainOutbox();
    await handleEvent(claimed(evs[0]!)); // reentrega do mesmo evento
    const opps = await db()
      .select()
      .from(s.opportunities)
      .where(and(eq(s.opportunities.clientId, c.clientId), eq(s.opportunities.type, 'renewal')));
    expect(opps).toHaveLength(1);
    expect(opps[0]!.mrrCents).toBe(500_000);
    // novo marco (30 dias) emite outro evento, mas não duplica a renovação
    await db()
      .update(s.contracts)
      .set({ endOn: new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10) })
      .where(eq(s.contracts.id, c.contractId!));
    await checkExpiringContracts();
    await drainOutbox();
    const evs2 = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'contract.expiring'))
    ).filter((e) => e.entityId === c.contractId);
    expect(evs2).toHaveLength(2);
    expect(
      await db()
        .select()
        .from(s.opportunities)
        .where(and(eq(s.opportunities.clientId, c.clientId), eq(s.opportunities.type, 'renewal'))),
    ).toHaveLength(1);
  });

  it('profundidade máxima: evento gerado em cadeia longa não dispara ações', async () => {
    const bia = await ctxOf('bia@demo.local');
    const t = await createTask(ctx, { title: uniq('Cadeia'), assigneeId: bia.memberId });
    const [ev] = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'task.assigned'))
    ).filter((e) => e.entityId === t.id);
    await db()
      .update(s.domainEvents)
      .set({ depth: 3, processedAt: new Date() })
      .where(eq(s.domainEvents.id, ev!.id));
    const r = await handleEvent(claimed({ ...ev!, depth: 3 }));
    expect(r.find((x) => x.rule === 'task_assigned_notify')!.status).toBe('skipped');
    expect(await db().select().from(s.notifications).where(eq(s.notifications.entityId, t.id))).toHaveLength(
      0,
    );
  });

  it('regra desativada não executa; reativar e reprocessar executa uma vez', async () => {
    const rules = await listRules(ctx);
    const rule = rules.find((r) => r.key === 'task_assigned_notify')!;
    await setRuleActive(ctx, rule.id, false);
    const bia = await ctxOf('bia@demo.local');
    const t = await createTask(ctx, { title: uniq('Regra off'), assigneeId: bia.memberId });
    await drainOutbox();
    expect(await db().select().from(s.notifications).where(eq(s.notifications.entityId, t.id))).toHaveLength(
      0,
    );
    await setRuleActive(ctx, rule.id, true);
    const [ev] = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'task.assigned'))
    ).filter((e) => e.entityId === t.id);
    await retryEvent(ctx, ev!.id);
    await retryEvent(ctx, ev!.id);
    expect(await db().select().from(s.notifications).where(eq(s.notifications.entityId, t.id))).toHaveLength(
      1,
    );
    const ex = await listExecutions(ctx, { ruleId: rule.id });
    expect(ex.filter((x) => x.e.eventId === ev!.id && x.e.status !== 'failed')).toHaveLength(1);
    await expect(setRuleActive(bia, rule.id, false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('preferências: in-app desligado não notifica; e-mail registra uma entrega única; WhatsApp fica desligado', async () => {
    const caio = await ctxOf('caio@demo.local');
    await setPreference(caio, 'task.assigned', 'inApp', false);
    await setPreference(caio, 'task.assigned', 'email', true);
    await setPreference(caio, 'task.assigned', 'whatsapp', true);
    const t = await createTask(ctx, { title: uniq('Preferência'), assigneeId: caio.memberId });
    await drainOutbox();
    const [n] = await db().select().from(s.notifications).where(eq(s.notifications.entityId, t.id));
    expect(n!.readAt).not.toBeNull(); // não aparece como novo no sino
    const del = await db()
      .select()
      .from(s.notificationDeliveries)
      .where(eq(s.notificationDeliveries.notificationId, n!.id));
    expect(del.map((d) => [d.channel, d.status]).sort()).toEqual([
      ['email', 'sent'],
      ['whatsapp', 'skipped'],
    ]);
    const [ev] = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'task.assigned'))
    ).filter((e) => e.entityId === t.id);
    await retryEvent(ctx, ev!.id);
    expect(
      await db()
        .select()
        .from(s.notificationDeliveries)
        .where(eq(s.notificationDeliveries.notificationId, n!.id)),
    ).toHaveLength(2);
    for (const ch of ['inApp', 'email', 'whatsapp'] as const)
      await setPreference(caio, 'task.assigned', ch, ch === 'inApp');
  });
});
