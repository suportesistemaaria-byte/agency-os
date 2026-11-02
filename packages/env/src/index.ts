import { z } from 'zod';

const optional = z.string().trim().min(1).optional().or(z.literal('').transform(() => undefined));

/** Variáveis do servidor. Nunca importe este módulo em código de navegador. */
export const serverSchema = z.object({
  APP_ENV: z.enum(['local', 'ci', 'preview', 'staging', 'production']).default('local'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url().optional(),
  INNGEST_EVENT_KEY: optional,
  INNGEST_SIGNING_KEY: optional,
  INNGEST_DEV: optional,
  SENTRY_DSN: optional,
  AXIOM_TOKEN: optional,
  AXIOM_DATASET: optional,
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  const env = parsed.data;
  if (env.APP_ENV === 'production' && (!env.INNGEST_SIGNING_KEY || !env.SENTRY_DSN)) {
    throw new Error('Produção exige INNGEST_SIGNING_KEY e SENTRY_DSN.');
  }
  if (source === process.env) cached = env;
  return env;
}

/** Variáveis públicas (prefixo NEXT_PUBLIC_). Nada sensível aqui. */
export const publicSchema = z.object({ NEXT_PUBLIC_SENTRY_DSN: optional });
