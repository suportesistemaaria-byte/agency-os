import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk } from './_shared';
import { memberStatus, overrideEffect, permissionScope } from './enums';

/** Raiz do multi-tenant. Não tem workspace_id: ela É o workspace. */
export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  currency: text('currency').notNull().default('BRL'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Identidade global (uma pessoa pode pertencer a vários workspaces). Campos extras exigidos pelo Better Auth. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Better Auth (identidade global, sem workspace_id; acesso só pelo papel dono) ──
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: tstz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_sessions_user').on(t.userId)],
);

export const authAccounts = pgTable('auth_accounts', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: tstz('access_token_expires_at'),
  refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authVerifications = pgTable('auth_verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authTwoFactors = pgTable('auth_two_factors', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: boolean('verified').notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: tstz('locked_until'),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: memberStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('workspace_members_ws_user').on(t.workspaceId, t.userId),
    unique('workspace_members_ws_id').on(t.workspaceId, t.id),
  ],
);

/** Catálogo global de permissões (modulo.acao). Não pertence a workspace. */
export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  module: text('module').notNull(),
  description: text('description').notNull(),
});

export const roles = pgTable(
  'roles',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('roles_ws_key').on(t.workspaceId, t.key), unique('roles_ws_id').on(t.workspaceId, t.id)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    workspaceId: workspaceId(),
    roleId: uuid('role_id').notNull(),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key),
    scope: permissionScope('scope').notNull().default('all'),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionKey] }),
    foreignKey({
      columns: [t.workspaceId, t.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }).onDelete('cascade'),
  ],
);

/** Um membro pode ter vários cargos. */
export const memberRoles = pgTable(
  'member_roles',
  {
    workspaceId: workspaceId(),
    memberId: uuid('member_id').notNull(),
    roleId: uuid('role_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.roleId] }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.workspaceId, t.roleId],
      foreignColumns: [roles.workspaceId, roles.id],
    }).onDelete('cascade'),
  ],
);

export const memberPermissionOverrides = pgTable(
  'member_permission_overrides',
  {
    workspaceId: workspaceId(),
    memberId: uuid('member_id').notNull(),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permissions.key),
    effect: overrideEffect('effect').notNull(),
    scope: permissionScope('scope').notNull().default('all'),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.permissionKey] }),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.id],
    }).onDelete('cascade'),
  ],
);

/** Convite por link. O token é de uso único; os cargos são aplicados ao aceitar. */
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    /** member = equipe; portal = contato do cliente. */
    kind: text('kind').notNull().default('member'),
    contactId: uuid('contact_id'),
    roleKeys: text('role_keys').array().notNull(),
    token: text('token').notNull().unique(),
    invitedBy: uuid('invited_by'),
    expiresAt: tstz('expires_at').notNull(),
    acceptedAt: tstz('accepted_at'),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('invitations_ws_id').on(t.workspaceId, t.id),
    wsFk('invitations', t, t.invitedBy, workspaceMembers),
  ],
);

/** Notificações in-app (V3, seção 10). dedupe_key evita duplicar o mesmo aviso. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    workspaceId: workspaceId().references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('notifications_ws_id').on(t.workspaceId, t.id),
    unique('notifications_dedupe').on(t.workspaceId, t.memberId, t.dedupeKey),
    index('notifications_member').on(t.workspaceId, t.memberId, t.createdAt),
    wsFk('notifications', t, t.memberId, workspaceMembers),
  ],
);
