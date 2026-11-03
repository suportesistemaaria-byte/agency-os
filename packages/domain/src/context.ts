import { and, eq, inArray } from 'drizzle-orm';
import { adminDb, appDb, schema as s, withTenant, PERMISSIONS, type TenantContext, type Tx } from '@aos/db';
import { runCommand, type CommandKit } from '@aos/core';
import { can, effectivePermissions, type PermSubject, type Perms, type Resource } from './permissions';
import { forbidden } from './errors';

/** Contexto de toda chamada de domínio: quem é, em qual workspace, com quais permissões. */
export interface Ctx extends PermSubject {
  workspaceId: string;
  userId: string | null;
  actorType: 'user' | 'system' | 'automation' | 'client_contact';
  requestId?: string;
  name: string;
  email: string;
  roleKeys: string[];
  timezone: string;
  /** Portal do cliente: contato e cliente fixos (RLS restritiva por client_id). */
  clientId?: string | null;
  contactId?: string | null;
  portalFinance?: boolean;
  /** Profundidade da cadeia de automações (anti-loop). */
  depth?: number;
}

export const tenant = (ctx: Ctx): TenantContext => ({
  workspaceId: ctx.workspaceId,
  userId: ctx.userId,
  actorType: ctx.actorType,
  requestId: ctx.requestId,
  clientId: ctx.clientId ?? null,
  portalFinance: ctx.portalFinance ?? false,
  depth: ctx.depth ?? 0,
});

/** Leitura com RLS (papel da aplicação + workspace fixado na transação). */
export const read = <T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  withTenant(appDb(), tenant(ctx), fn);

/** Escrita: transação + outbox + auditoria (runCommand). */
export const command = <T>(name: string, ctx: Ctx, fn: (kit: CommandKit) => Promise<T>): Promise<T> =>
  runCommand(name, tenant(ctx), fn);

export function assertCan(ctx: Ctx, perm: string, resource?: Resource): void {
  if (!can(ctx, perm, resource)) throw forbidden();
}

const ALL_PERMS: Perms = new Map(Object.keys(PERMISSIONS).map((k) => [k, 'all' as const]));

/** Contexto de automação/sistema: age em nome do workspace, sem usuário. */
export function systemCtx(
  workspaceId: string,
  actorType: 'system' | 'automation' = 'automation',
  depth = 0,
): Ctx {
  return {
    depth,
    workspaceId,
    userId: null,
    memberId: '00000000-0000-0000-0000-000000000000',
    actorType,
    perms: ALL_PERMS,
    teamClientIds: new Set(),
    name: actorType === 'automation' ? 'Automação' : 'Sistema',
    email: '',
    roleKeys: [],
    timezone: 'America/Sao_Paulo',
  };
}

export interface Membership {
  workspaceId: string;
  workspaceName: string;
  memberId: string;
  timezone: string;
}

/**
 * Workspaces do usuário (identidade é global). Usa o papel dono porque a consulta atravessa workspaces;
 * é o mesmo limite do Better Auth. Só membros ativos.
 */
export async function membershipsOf(userId: string): Promise<Membership[]> {
  const rows = await adminDb()
    .select({
      workspaceId: s.workspaces.id,
      workspaceName: s.workspaces.name,
      memberId: s.workspaceMembers.id,
      timezone: s.workspaces.timezone,
    })
    .from(s.workspaceMembers)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.workspaceMembers.workspaceId))
    .where(and(eq(s.workspaceMembers.userId, userId), eq(s.workspaceMembers.status, 'active')))
    .orderBy(s.workspaceMembers.createdAt);
  return rows;
}

/** Monta o contexto a partir da sessão. workspaceId preferido (cookie) quando o usuário é membro dele. */
export async function loadCtx(
  userId: string,
  preferredWorkspaceId?: string | null,
  requestId?: string,
): Promise<Ctx | null> {
  const ms = await membershipsOf(userId);
  const m = ms.find((x) => x.workspaceId === preferredWorkspaceId) ?? ms[0];
  if (!m) return null;
  const base = { workspaceId: m.workspaceId, userId, actorType: 'user' as const, requestId };
  return withTenant(appDb(), base, async (tx) => {
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, userId));
    const roles = await tx
      .select({ key: s.roles.key, id: s.roles.id })
      .from(s.memberRoles)
      .innerJoin(s.roles, eq(s.roles.id, s.memberRoles.roleId))
      .where(eq(s.memberRoles.memberId, m.memberId));
    const grants = roles.length
      ? await tx
          .select({ permissionKey: s.rolePermissions.permissionKey, scope: s.rolePermissions.scope })
          .from(s.rolePermissions)
          .where(
            inArray(
              s.rolePermissions.roleId,
              roles.map((r) => r.id),
            ),
          )
      : [];
    const overrides = await tx
      .select({
        permissionKey: s.memberPermissionOverrides.permissionKey,
        scope: s.memberPermissionOverrides.scope,
        effect: s.memberPermissionOverrides.effect,
      })
      .from(s.memberPermissionOverrides)
      .where(eq(s.memberPermissionOverrides.memberId, m.memberId));
    const team = await tx
      .select({ clientId: s.clientTeam.clientId })
      .from(s.clientTeam)
      .where(eq(s.clientTeam.memberId, m.memberId));
    return {
      ...base,
      memberId: m.memberId,
      perms: effectivePermissions(grants, overrides),
      teamClientIds: new Set(team.map((t) => t.clientId)),
      name: u?.name ?? '',
      email: u?.email ?? '',
      roleKeys: roles.map((r) => r.key),
      timezone: m.timezone,
    };
  });
}
