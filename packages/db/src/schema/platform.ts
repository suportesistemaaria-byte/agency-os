import { boolean, foreignKey, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, workspaceId } from './_shared';
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

/** Identidade global (uma pessoa pode pertencer a vários workspaces). Better Auth estende na Sprint 1. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
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
