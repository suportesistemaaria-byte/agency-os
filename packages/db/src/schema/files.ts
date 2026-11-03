import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, workspaceId, wsFk, wsUnique } from './_shared';
import { clients } from './clients';
import { workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });

/** Metadados de arquivo. Os bytes ficam no storage (R2; em dev, disco local) com chave ws/{workspace}/... */
export const files = pgTable(
  'files',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id'),
    storageKey: text('storage_key').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    category: text('category'),
    uploadedBy: uuid('uploaded_by'),
    deletedAt: tstz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('files', t), wsFk('files', t, t.clientId, clients)],
);

/** Arquivo ↔ entidade (a permissão é herdada da entidade dona). */
export const fileLinks = pgTable(
  'file_links',
  {
    id: id(),
    workspaceId: ws(),
    fileId: uuid('file_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('file_links', t),
    wsFk('file_links', t, t.fileId, files),
    index('file_links_entity').on(t.workspaceId, t.entityType, t.entityId),
  ],
);
