import { eq } from 'drizzle-orm';
import { adminDb } from './client';
import { workspaces } from './schema';

export const hasDb = (): boolean => Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL);

/** Busca os dois workspaces criados pelo seed. Testes de integração dependem de "pnpm db:seed". */
export async function seededWorkspaces(): Promise<{ a: string; b: string }> {
  const db = adminDb();
  const [a] = await db.select().from(workspaces).where(eq(workspaces.slug, 'agencia-4p'));
  const [b] = await db.select().from(workspaces).where(eq(workspaces.slug, 'workspace-teste'));
  if (!a || !b) throw new Error('Rode "pnpm db:seed" antes dos testes de integração.');
  return { a: a.id, b: b.id };
}
