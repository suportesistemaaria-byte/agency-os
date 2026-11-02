import { sql } from 'drizzle-orm';
import { schema, type Db, type TenantContext, type Tx } from '@aos/db';
import { EVENT_NAME, parsePayload, type EventPayload, type EventType } from './catalog';

export interface EmitInput<T extends EventType> {
  type: T;
  entityType: string;
  entityId?: string | null;
  payload: EventPayload<T>;
  /** Evita duplicar o mesmo evento quando o comando é repetido. */
  idempotencyKey?: string;
}

/**
 * Grava o evento no outbox DENTRO da transação recebida.
 * Se a transação falhar, o evento não existe; se commitar, o relay garante a entrega.
 */
export async function emit<T extends EventType>(tx: Tx, ctx: TenantContext, e: EmitInput<T>): Promise<string> {
  if (!EVENT_NAME.test(e.type)) throw new Error(`Nome de evento inválido: ${e.type}`);
  const payload = parsePayload(e.type, e.payload) as Record<string, unknown>;
  const [row] = await tx
    .insert(schema.domainEvents)
    .values({
      workspaceId: ctx.workspaceId,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      actorType: ctx.actorType ?? (ctx.userId ? 'user' : 'system'),
      actorId: ctx.userId ?? null,
      payload,
      idempotencyKey: e.idempotencyKey ?? null,
    })
    .onConflictDoNothing({ target: [schema.domainEvents.workspaceId, schema.domainEvents.idempotencyKey] })
    .returning({ id: schema.domainEvents.id });
  return row?.id ?? 'duplicate';
}

export interface ClaimedEvent {
  id: string;
  workspace_id: string;
  type: string;
  version: number;
  entity_type: string;
  entity_id: string | null;
  actor_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
  attempts: number;
}

/** Backoff exponencial com teto de 1 hora. */
export const backoffSeconds = (attempts: number): number => Math.min(3600, 2 ** Math.min(attempts, 12) * 5);

/**
 * Reserva um lote de eventos pendentes (relay, papel dono). FOR UPDATE SKIP LOCKED permite vários relays em paralelo.
 * A reserva empurra available_at para frente: se o relay morrer, o lote volta a ficar disponível sozinho.
 */
export async function claimBatch(admin: Db, limit = 100): Promise<ClaimedEvent[]> {
  const r = await admin.execute<ClaimedEvent>(sql`
    update domain_events d set attempts = d.attempts + 1, available_at = now() + interval '2 minutes'
    where d.id in (
      select id from domain_events
      where processed_at is null and available_at <= now()
      order by occurred_at
      limit ${limit}
      for update skip locked
    )
    returning d.id, d.workspace_id, d.type, d.version, d.entity_type, d.entity_id, d.actor_type, d.actor_id, d.payload, d.occurred_at, d.attempts`);
  return r.rows;
}

export async function markProcessed(admin: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await admin.execute(sql`update domain_events set processed_at = now(), last_error = null where id = any(${ids}::uuid[])`);
}

export async function markFailed(admin: Db, id: string, attempts: number, error: string): Promise<void> {
  await admin.execute(sql`
    update domain_events set last_error = ${error.slice(0, 2000)},
      available_at = now() + make_interval(secs => ${backoffSeconds(attempts)})
    where id = ${id}`);
}

/** Eventos parados há mais de 10 minutos (alerta de monitoramento). */
export async function stuckCount(admin: Db): Promise<number> {
  const r = await admin.execute<{ n: number }>(
    sql`select count(*)::int as n from domain_events where processed_at is null and occurred_at < now() - interval '10 minutes'`,
  );
  return r.rows[0]?.n ?? 0;
}
