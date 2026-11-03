import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import type { ClaimedEvent } from '@aos/events';
import { createLead, createProposal, sendProposal } from './crm';
import { createTask } from './tasks';
import { drainOutbox } from './dispatcher';
import { handleEvent } from './automation';
import type { Ctx } from './context';
import { ctxOf, hasDb, uniq } from './test-helpers';

const db = () => adminDb();
const asClaimed = (e: typeof s.domainEvents.$inferSelect): ClaimedEvent => ({
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
});

describe.skipIf(!hasDb())('automações (TRIGGER → ACTION sobre o outbox)', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
  });
  afterAll(closeAll);

  it('proposal.sent cria follow-ups D+2, D+5 e D+10 e reprocessar o evento não duplica', async () => {
    const l = await createLead(ctx, { companyName: uniq('Follow-up SA') });
    const p = await createProposal(ctx, l.opportunityId, {
      title: 'P',
      items: [{ description: 'Mensal', kind: 'recurring', quantity: 1, unitCents: 100_000 }],
    });
    await sendProposal(ctx, p.id);
    await drainOutbox();
    const follow = async () =>
      (
        await db()
          .select()
          .from(s.nextActions)
          .where(
            and(eq(s.nextActions.opportunityId, l.opportunityId), eq(s.nextActions.source, 'automation')),
          )
      ).filter((n) => n.title.startsWith('Follow-up'));
    const f1 = await follow();
    expect(f1.map((n) => n.title).sort()).toEqual([
      'Follow-up D+10 da proposta',
      'Follow-up D+2 da proposta',
      'Follow-up D+5 da proposta',
    ]);
    expect(f1[0]!.dueAt.getTime()).toBeGreaterThan(Date.now());
    const [ev] = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'proposal.sent'))
    ).filter((e) => e.entityId === p.id);
    // entrega "pelo menos uma vez": o mesmo evento chega de novo
    const again = await handleEvent(asClaimed(ev!));
    expect(again.find((x) => x.rule === 'proposal_followups')!.status).toBe('duplicate');
    expect(await follow()).toHaveLength(3);
    const execs = await db()
      .select()
      .from(s.automationExecutions)
      .where(eq(s.automationExecutions.eventId, ev!.id));
    expect(execs.filter((x) => x.status !== 'failed')).toHaveLength(1);
  });

  it('task.assigned notifica o responsável uma única vez (sem envio duplicado)', async () => {
    const bia = await ctxOf('bia@demo.local');
    const t = await createTask(ctx, { title: uniq('Tarefa notificação'), assigneeId: bia.memberId });
    await drainOutbox();
    const [ev] = (
      await db().select().from(s.domainEvents).where(eq(s.domainEvents.type, 'task.assigned'))
    ).filter((e) => e.entityId === t.id);
    await handleEvent(asClaimed(ev!));
    await handleEvent(asClaimed(ev!));
    const n = await db()
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.memberId, bia.memberId), eq(s.notifications.entityId, t.id)));
    expect(n).toHaveLength(1);
    expect(n[0]!.link).toBe(`/tarefas/${t.id}`);
  });

  it('o outbox fica vazio depois do despacho (nenhum evento perdido)', async () => {
    await drainOutbox();
    const pending = (await db().select().from(s.domainEvents)).filter(
      (e) => !e.processedAt && e.availableAt <= new Date(),
    );
    expect(pending).toHaveLength(0);
  });
});
