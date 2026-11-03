import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { assertCan, command, read, type Ctx } from './context';
import { forbidden, must } from './errors';
import { sha256, storage, validateUpload } from './storage';
import { can } from './permissions';

export interface UploadInput {
  name: string;
  bytes: Uint8Array;
  clientId?: string | null;
  category?: string;
  link?: { entityType: string; entityId: string };
}

export async function storeFileIn(kit: CommandKit, input: UploadInput) {
  const { mime } = validateUpload(input.name, input.bytes);
  const id = crypto.randomUUID();
  const safe = input.name.replace(/[^\w.-]+/g, '_').slice(-120);
  const key = `ws/${kit.ctx.workspaceId}/${input.link?.entityType ?? 'file'}/${input.link?.entityId ?? 'avulso'}/${id}/${safe}`;
  await storage().put(key, input.bytes, mime);
  const [f] = await kit.tx
    .insert(s.files)
    .values({
      id,
      workspaceId: kit.ctx.workspaceId,
      clientId: input.clientId ?? null,
      storageKey: key,
      name: input.name,
      mime,
      size: input.bytes.byteLength,
      sha256: sha256(input.bytes),
      category: input.category,
      uploadedBy: kit.ctx.userId ?? null,
    })
    .returning();
  if (input.link)
    await kit.tx.insert(s.fileLinks).values({
      workspaceId: kit.ctx.workspaceId,
      fileId: id,
      entityType: input.link.entityType,
      entityId: input.link.entityId,
    });
  await kit.emit({
    type: 'file.uploaded',
    entityType: 'file',
    entityId: id,
    payload: { fileId: id, clientId: input.clientId ?? null },
  });
  return f!;
}

export async function uploadFile(ctx: Ctx, input: UploadInput) {
  if (input.clientId) assertCan(ctx, 'clientes.view', { clientId: input.clientId });
  return command('files.upload', ctx, (kit) => storeFileIn(kit, input));
}

/** Leitura de arquivo: a permissão vem da entidade dona (cliente). */
export async function readFileFor(ctx: Ctx, fileId: string) {
  const f = await read(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(s.files)
      .where(and(eq(s.files.id, fileId), isNull(s.files.deletedAt)));
    return must(row, 'Arquivo não encontrado.');
  });
  if (
    f.clientId &&
    !can(ctx, 'clientes.view', { clientId: f.clientId }) &&
    !can(ctx, 'conteudo.view', { clientId: f.clientId })
  )
    throw forbidden();
  return { file: f, bytes: await storage().get(f.storageKey) };
}

export async function listClientFiles(ctx: Ctx, clientId: string) {
  assertCan(ctx, 'clientes.view', { clientId });
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.files)
      .where(and(eq(s.files.clientId, clientId), isNull(s.files.deletedAt)))
      .orderBy(desc(s.files.createdAt)),
  );
}
