import { adminDb } from '@aos/db';
import { claimBatch, markFailed, markProcessed } from '@aos/events';
import { childLogger } from '@aos/logger';
import { handleEvent } from './automation';

const log = childLogger({ module: 'dispatcher' });

/**
 * Despachante local do outbox (desenvolvimento sem Inngest): reserva lotes com SKIP LOCKED,
 * executa o motor de automações e marca como processado. Em produção, o relay entrega ao
 * Inngest, que chama o mesmo handleEvent (consumidor idempotente).
 */
export async function drainOutbox(maxRounds = 10): Promise<number> {
  const admin = adminDb();
  let total = 0;
  for (let round = 0; round < maxRounds; round++) {
    const batch = await claimBatch(admin, 50);
    if (!batch.length) break;
    const ok: string[] = [];
    for (const ev of batch) {
      try {
        await handleEvent(ev);
        ok.push(ev.id);
      } catch (err) {
        await markFailed(admin, ev.id, ev.attempts, String(err));
      }
    }
    await markProcessed(admin, ok);
    total += batch.length;
  }
  if (total) log.debug({ total }, 'outbox.drained');
  return total;
}

let running: Promise<number> | null = null;
let again = false;

/** Dispara o despacho sem bloquear a requisição; agrega chamadas concorrentes. */
export function kickDispatcher(): Promise<number> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let n = 0;
    do {
      again = false;
      n += await drainOutbox();
    } while (again);
    return n;
  })().finally(() => {
    running = null;
  });
  return running;
}
