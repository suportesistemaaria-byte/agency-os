import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Storage de arquivos atrás de uma interface única (V3, seção 12). Produção: R2 com URL assinada.
 * Desenvolvimento: disco local (adaptador "mockado", registrado em DECISIONS).
 */
export interface StorageAdapter {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

export class LocalDiskStorage implements StorageAdapter {
  constructor(private root = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), '.data', 'storage'))) {}
  private path(key: string) {
    if (key.includes('..')) throw new Error('Chave inválida');
    return join(this.root, key);
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.path(key)));
  }
}

/**
 * Adaptador em Postgres (tabela file_blobs) para ambientes sem disco persistente e sem R2 (ex.: demo na Vercel).
 * Limite de 25 MB por arquivo; vídeos grandes exigem o R2.
 */
export class PostgresStorage implements StorageAdapter {
  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > 25 * 1024 * 1024)
      throw new Error('Arquivo acima de 25 MB: configure o R2 para arquivos grandes.');
    const { adminDb } = await import('@aos/db');
    const { sql } = await import('drizzle-orm');
    await adminDb().execute(
      sql`insert into file_blobs (storage_key, bytes) values (${key}, ${Buffer.from(bytes)}) on conflict (storage_key) do nothing`,
    );
  }
  async get(key: string): Promise<Uint8Array> {
    const { adminDb } = await import('@aos/db');
    const { sql } = await import('drizzle-orm');
    const r = await adminDb().execute<{ bytes: Buffer }>(
      sql`select bytes from file_blobs where storage_key = ${key}`,
    );
    if (!r.rows[0]) throw new Error('Arquivo não encontrado no storage.');
    return new Uint8Array(r.rows[0].bytes);
  }
}

let adapter: StorageAdapter | undefined;
export const storage = (): StorageAdapter =>
  (adapter ??= process.env.STORAGE_DRIVER === 'db' ? new PostgresStorage() : new LocalDiskStorage());
export const setStorage = (a: StorageAdapter) => {
  adapter = a;
};

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const LIMITS: [RegExp, number][] = [
  [/^image\//, 30 * 1024 * 1024],
  [/^application\/pdf$/, 50 * 1024 * 1024],
  [/^video\//, 2 * 1024 * 1024 * 1024],
];

/** Confere o tipo real pelos primeiros bytes (magic bytes), não pela extensão. */
export function sniffMime(b: Uint8Array): string | null {
  const h = (n: number) =>
    Array.from(b.slice(0, n))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  if (h(8) === '89504e470d0a1a0a') return 'image/png';
  if (h(3) === 'ffd8ff') return 'image/jpeg';
  if (h(4) === '47494638') return 'image/gif';
  if (h(4) === '52494646' && Buffer.from(b.slice(8, 12)).toString() === 'WEBP') return 'image/webp';
  if (h(4) === '25504446') return 'application/pdf';
  if (Buffer.from(b.slice(4, 8)).toString() === 'ftyp') return 'video/mp4';
  const head = Buffer.from(b.slice(0, 200)).toString().trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return null; // SVG bloqueado (XSS)
  return null;
}

export function validateUpload(name: string, bytes: Uint8Array): { mime: string } {
  const mime = sniffMime(bytes);
  if (!mime) throw new Error(`Tipo de arquivo não permitido: ${name}`);
  const limit = LIMITS.find(([re]) => re.test(mime))?.[1] ?? 0;
  if (bytes.byteLength > limit) throw new Error(`Arquivo acima do limite: ${name}`);
  return { mime };
}
