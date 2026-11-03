import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const pools = new Map<string, pg.Pool>();

function pool(url: string): pg.Pool {
  let p = pools.get(url);
  if (!p) {
    p = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
    pools.set(url, p);
  }
  return p;
}

/** Conexão do papel da aplicação (RLS ativa). Use SEMPRE via withTenant. */
export function appDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error('DATABASE_URL não definida');
  return drizzle(pool(url), { schema });
}

/**
 * Conexão do papel dono (ignora RLS). Restrita a: migrações, seeds, relay do outbox
 * e jobs administrativos entre workspaces. Nunca em rotas de usuário.
 */
export function adminDb(url = process.env.DATABASE_ADMIN_URL): Db {
  if (!url) throw new Error('DATABASE_ADMIN_URL não definida');
  return drizzle(pool(url), { schema });
}

export interface TenantContext {
  workspaceId: string;
  userId?: string | null;
  actorType?: 'user' | 'client_contact' | 'system' | 'automation';
  requestId?: string;
  /** Portal: fixa o cliente do contato; a RLS restritiva limita tudo a ele. */
  clientId?: string | null;
  /** Portal: contato com a flag "recebe financeiro" (libera faturas do próprio cliente). */
  portalFinance?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abre uma transação com o workspace fixado em app.workspace_id (SET LOCAL).
 * As políticas RLS filtram por esse valor; sem ele, nenhuma linha é visível (fail-closed).
 */
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(ctx.workspaceId)) throw new Error('workspaceId inválido');
  if (ctx.userId && !UUID.test(ctx.userId)) throw new Error('userId inválido');
  if (ctx.clientId && !UUID.test(ctx.clientId)) throw new Error('clientId inválido');
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.workspace_id', ${ctx.workspaceId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true),
        set_config('app.client_id', ${ctx.clientId ?? ''}, true), set_config('app.portal_finance', ${ctx.portalFinance ? '1' : ''}, true)`,
    );
    return fn(tx);
  });
}

export async function closeAll(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}
