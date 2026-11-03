import 'server-only';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { DomainError, type Ctx } from '@aos/domain';
import { logger } from '@aos/logger';
import { getCtx, getPortalCtx } from './session';

export const createContext = async () => {
  const ctx = await getCtx();
  return { ctx, portal: ctx ? null : await getPortalCtx() };
};

const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: { ...shape.data, zod: error.cause instanceof ZodError ? error.cause.flatten() : null },
    };
  },
});

const CODE: Record<DomainError['code'], TRPCError['code']> = {
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
};

/** Traduz erros de domínio e do banco em mensagens claras; erro inesperado vira 500 com log. */
const errors = t.middleware(async ({ next, path }) => {
  const res = await next();
  if (!res.ok) {
    const cause = res.error.cause;
    if (cause instanceof DomainError)
      throw new TRPCError({ code: CODE[cause.code], message: cause.message, cause });
    const pgCode = (cause as { code?: string } | undefined)?.code;
    if (pgCode === '23514' || pgCode === '23505' || pgCode === '42501')
      throw new TRPCError({ code: 'BAD_REQUEST', message: (cause as Error).message, cause });
    if (res.error.code === 'INTERNAL_SERVER_ERROR')
      logger.error({ path, err: String(cause ?? res.error) }, 'trpc.error');
  }
  return res;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(errors);
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.ctx) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Faça login.' });
  return next({ ctx: { ctx: ctx.ctx as Ctx } });
});

/** Procedimentos do portal: só para contato de cliente (a RLS restritiva limita ao cliente dele). */
export const portalProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.portal) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Faça login no portal.' });
  return next({ ctx: { portal: ctx.portal } });
});
