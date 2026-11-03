import { eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Ctx } from './context';

/**
 * Filtro de listagem pelo escopo da permissão (all/team/own). A RLS isola o workspace;
 * este filtro aplica o RBAC dentro dele. Sem a permissão, nada é listado.
 */
export function scopeWhere(
  ctx: Ctx,
  perm: string,
  opts: { client?: AnyPgColumn; owners?: AnyPgColumn[]; ownerSql?: SQL[] },
): SQL | undefined {
  const scope = ctx.perms.get(perm);
  if (!scope) return sql`false`;
  if (scope === 'all') return undefined;
  const conds: SQL[] = [...(opts.owners ?? []).map((c) => eq(c, ctx.memberId)), ...(opts.ownerSql ?? [])];
  if (scope === 'team' && opts.client) {
    const ids = [...ctx.teamClientIds];
    conds.push(ids.length ? inArray(opts.client, ids) : sql`false`);
  }
  return conds.length ? or(...conds) : sql`false`;
}
