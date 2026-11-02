import { adminDb } from '@aos/db';
import { claimBatch, inngestName, markFailed, markProcessed, stuckCount } from '@aos/events';
import { logger } from '@aos/logger';
import { inngest } from '../client';

/**
 * Relay do outbox: lê domain_events pendentes e publica no Inngest.
 * Roda a cada minuto (garantia) e também quando o app "cutuca" após um commit (latência baixa).
 * O id do evento no Inngest = id do domain_event → reentrega não duplica consumidores.
 */
export const outboxRelay = inngest.createFunction(
  { id: 'outbox-relay', concurrency: { limit: 1 } },
  [{ cron: '* * * * *' }, { event: 'aos/outbox.flush' }],
  async ({ step }) => {
    const batch = await step.run('claim', () => claimBatch(adminDb(), 200));
    if (batch.length === 0) return { delivered: 0 };
    const delivered: string[] = [];
    for (const e of batch) {
      try {
        await step.sendEvent(`send-${e.id}`, {
          id: e.id,
          name: inngestName(e.type),
          data: {
            eventId: e.id,
            workspaceId: e.workspace_id,
            type: e.type,
            version: e.version,
            entityType: e.entity_type,
            entityId: e.entity_id,
            actorType: e.actor_type,
            actorId: e.actor_id,
            payload: e.payload,
            occurredAt: e.occurred_at,
          },
        });
        delivered.push(e.id);
      } catch (err) {
        await markFailed(adminDb(), e.id, e.attempts, String(err));
      }
    }
    await step.run('mark', () => markProcessed(adminDb(), delivered));
    return { delivered: delivered.length };
  },
);

/** Alerta se o outbox parar (monitoramento). */
export const outboxWatchdog = inngest.createFunction(
  { id: 'outbox-watchdog' },
  { cron: '*/10 * * * *' },
  async () => {
    const n = await stuckCount(adminDb());
    if (n > 0) logger.error({ stuck: n }, 'outbox.stuck');
    return { stuck: n };
  },
);
