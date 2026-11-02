import pino from 'pino';
import { redact, REDACTED, SENSITIVE_KEY } from './redact';

export { redact, REDACTED, SENSITIVE_KEY };

/**
 * Logs técnicos estruturados (JSON). Regras:
 * - sem dados pessoais (use IDs);
 * - sem segredos (redação automática);
 * - sempre com workspaceId/requestId quando houver.
 * Em produção, o stdout é coletado pela Vercel e encaminhado ao Axiom (log drain).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'agency-os', env: process.env.APP_ENV ?? 'local' },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.secret',
      '*.authorization',
      '*.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: REDACTED,
  },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

export const childLogger = (bindings: {
  workspaceId?: string;
  requestId?: string;
  module?: string;
}): Logger => logger.child(bindings);
