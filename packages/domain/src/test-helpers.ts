import { and, eq } from 'drizzle-orm';
import { adminDb, schema as s } from '@aos/db';
import { loadCtx, type Ctx } from './context';

export const hasDb = (): boolean => Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL);

/** Contexto real de um usuário do seed de demonstração (pnpm db:seed). */
export async function ctxOf(email: string, slug = 'agencia-4p'): Promise<Ctx> {
  const db = adminDb();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  const [w] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, slug));
  if (!u || !w) throw new Error(`Rode "pnpm db:seed" (faltou ${email}).`);
  const ctx = await loadCtx(u.id, w.id);
  if (!ctx) throw new Error(`${email} não é membro ativo de ${slug}`);
  return ctx;
}

export async function clientIdByName(name: string, slug = 'agencia-4p') {
  const db = adminDb();
  const [w] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, slug));
  const [c] = await db
    .select()
    .from(s.clients)
    .where(and(eq(s.clients.workspaceId, w!.id), eq(s.clients.name, name)));
  return c!.id;
}

export const uniq = (p: string) => `${p} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
