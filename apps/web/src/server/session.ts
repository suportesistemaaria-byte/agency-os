import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DomainError, loadCtx, loadPortalCtx, type Ctx, type PortalCtx } from '@aos/domain';
import { auth } from './auth';

export const WS_COOKIE = 'aos_ws';

/** Contexto da requisição (sessão → membro → permissões). Cacheado por requisição. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const ws = (await cookies()).get(WS_COOKIE)?.value;
  return loadCtx(session.user.id, ws, crypto.randomUUID());
});

export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) {
    // Contato de cliente logado cai no portal, nunca no app interno.
    if (await getPortalCtx()) redirect('/portal');
    redirect('/login');
  }
  return ctx;
}

/** Contexto do portal (contato do cliente) a partir da sessão. */
export const getPortalCtx = cache(async (): Promise<PortalCtx | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const p = await loadPortalCtx(session.user.id, crypto.randomUUID());
  return p ? { ...p, sessionCreatedAt: new Date(session.session.createdAt) } : null;
});

export async function requirePortal(): Promise<PortalCtx> {
  const p = await getPortalCtx();
  if (!p) redirect('/portal/login');
  return p;
}

/** Página só para quem tem a permissão: a interface esconde, mas o servidor já bloqueia. */
export async function requirePerm(perm: string): Promise<Ctx> {
  const ctx = await requireCtx();
  if (!ctx.perms.has(perm)) redirect('/sem-permissao');
  return ctx;
}

/** Converte erros de domínio em navegação: sem permissão → /sem-permissao; inexistente → 404. */
export async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DomainError && e.code === 'FORBIDDEN') redirect('/sem-permissao');
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
}
