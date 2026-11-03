import 'server-only';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import pg from 'pg';
import { logger } from '@aos/logger';
import { hasPendingInvite } from '@aos/domain';

const ts = { createdAt: 'created_at', updatedAt: 'updated_at' };

/**
 * Better Auth no nosso Postgres (V3: dados de usuário ficam conosco). Identidade é global, então as
 * tabelas de auth (sem workspace_id) usam o papel dono — mesmo limite registrado em DECISIONS.
 * Em dev, e-mails (recuperação de senha) aparecem no log: adaptador "mockado".
 */
export const auth = betterAuth({
  appName: 'Agency OS',
  baseURL: process.env.APP_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  database: new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 3 }),
  advanced: { database: { generateId: 'uuid' }, cookiePrefix: 'aos' },
  user: { modelName: 'users', fields: { emailVerified: 'email_verified', ...ts } },
  session: {
    modelName: 'auth_sessions',
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      ...ts,
    },
    // V3, seção 16: equipe expira por inatividade em 12h.
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 15,
  },
  account: {
    modelName: 'auth_accounts',
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      ...ts,
    },
  },
  verification: { modelName: 'auth_verifications', fields: { expiresAt: 'expires_at', ...ts } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Cadastro só por convite: o hook abaixo recusa e-mails sem convite pendente.
    disableSignUp: false,
    async sendResetPassword({ user, url }) {
      logger.info({ to: user.email, url, adapter: 'email-log' }, 'E-mail (dev): redefinição de senha');
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!(await hasPendingInvite(user.email))) return false;
          return { data: user };
        },
      },
    },
  },
  plugins: [
    // 2FA preparado (obrigatório para Admin e Financeiro na produção — V3, seção 16).
    twoFactor({
      issuer: 'Agency OS',
      schema: {
        twoFactor: {
          modelName: 'auth_two_factors',
          fields: {
            userId: 'user_id',
            backupCodes: 'backup_codes',
            failedVerificationCount: 'failed_verification_count',
            lockedUntil: 'locked_until',
          },
        },
        user: { fields: { twoFactorEnabled: 'two_factor_enabled' } },
      },
    }),
    nextCookies(),
  ],
});
