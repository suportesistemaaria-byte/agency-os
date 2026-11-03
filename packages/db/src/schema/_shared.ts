import { sql } from 'drizzle-orm';
import { foreignKey, timestamp, uuid, unique, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
export const workspaceId = () => uuid('workspace_id').notNull();
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
export const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** UNIQUE (workspace_id, id): alvo das FKs compostas (V3, seção 4). */
export const wsUnique = (table: string, t: { workspaceId: AnyPgColumn; id: AnyPgColumn }) =>
  unique(`${table}_ws_id`).on(t.workspaceId, t.id);

/** FK composta (workspace_id, coluna) → (workspace_id, id): impossível ligar registros de workspaces diferentes. */
export const wsFk = (
  table: string,
  t: { workspaceId: AnyPgColumn },
  col: AnyPgColumn,
  target: { workspaceId: AnyPgColumn; id: AnyPgColumn },
  name?: string,
) =>
  foreignKey({
    name: `${table}_${name ?? col.name}_fk`,
    columns: [t.workspaceId, col],
    foreignColumns: [target.workspaceId, target.id],
  });
