import { logger } from '@aos/logger';
import { inngest } from '../client';

/**
 * Consumidor de exemplo: prova que o caminho evento → Inngest → função funciona.
 * Automações (Sprint 8) e notificações (Sprint 4) seguem este mesmo formato.
 */
export const eventProbe = inngest.createFunction(
  { id: 'event-probe', idempotency: 'event.data.eventId' },
  [{ event: 'aos/system.healthcheck' }, { event: 'aos/holiday.created' }],
  async ({ event }) => {
    logger.info({ workspaceId: event.data.workspaceId, type: event.data.type }, 'event.consumed');
    return { ok: true };
  },
);
