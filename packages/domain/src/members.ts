import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { adminDb, schema as s, PERMISSIONS, SYSTEM_ROLES } from '@aos/db';
import { runCommand } from '@aos/core';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, forbidden, must } from './errors';

export async function listMembers(ctx: Ctx) {
  return read(ctx, async (tx) => {
    const rows = await tx
      .select({
        m: s.workspaceMembers,
        name: s.users.name,
        email: s.users.email,
        twoFactor: s.users.twoFactorEnabled,
      })
      .from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .orderBy(asc(s.users.name));
    const roles = await tx
      .select({ memberId: s.memberRoles.memberId, key: s.roles.key, name: s.roles.name })
      .from(s.memberRoles)
      .innerJoin(s.roles, eq(s.roles.id, s.memberRoles.roleId));
    const overrides = await tx.select().from(s.memberPermissionOverrides);
    return rows.map((r) => ({
      id: r.m.id,
      userId: r.m.userId,
      status: r.m.status,
      name: r.name,
      email: r.email,
      twoFactor: r.twoFactor,
      roles: roles.filter((x) => x.memberId === r.m.id),
      overrides: overrides.filter((o) => o.memberId === r.m.id),
    }));
  });
}

export async function listRolesMatrix(ctx: Ctx) {
  return read(ctx, async (tx) => {
    const roles = await tx.select().from(s.roles).orderBy(asc(s.roles.name));
    const grants = await tx.select().from(s.rolePermissions);
    return {
      permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })),
      roles: roles.map((r) => ({ ...r, grants: grants.filter((g) => g.roleId === r.id) })),
    };
  });
}

export async function setMemberRoles(ctx: Ctx, memberId: string, roleKeys: string[]) {
  assertCan(ctx, 'members.manage');
  if (!roleKeys.length) throw badRequest('O membro precisa de ao menos um cargo.');
  return command('members.setRoles', ctx, async (kit) => {
    const before = await kit.tx
      .select({ key: s.roles.key })
      .from(s.memberRoles)
      .innerJoin(s.roles, eq(s.roles.id, s.memberRoles.roleId))
      .where(eq(s.memberRoles.memberId, memberId));
    const roles = await kit.tx.select().from(s.roles).where(inArray(s.roles.key, roleKeys));
    if (roles.length !== roleKeys.length) throw badRequest('Cargo inválido.');
    await kit.tx.delete(s.memberRoles).where(eq(s.memberRoles.memberId, memberId));
    await kit.tx
      .insert(s.memberRoles)
      .values(roles.map((r) => ({ workspaceId: ctx.workspaceId, memberId, roleId: r.id })));
    await kit.audit({
      action: 'member.role_changed',
      entityType: 'member',
      entityId: memberId,
      before: { roles: before.map((b) => b.key).sort() },
      after: { roles: [...roleKeys].sort() },
    });
    await kit.emit({
      type: 'member.role_changed',
      entityType: 'member',
      entityId: memberId,
      payload: { memberId, roleKeys },
    });
  });
}

export async function setMemberStatus(ctx: Ctx, memberId: string, status: 'active' | 'suspended') {
  assertCan(ctx, 'members.manage');
  if (memberId === ctx.memberId) throw badRequest('Você não pode desativar a si mesmo.');
  return command('members.setStatus', ctx, async (kit) => {
    const [m] = await kit.tx.select().from(s.workspaceMembers).where(eq(s.workspaceMembers.id, memberId));
    const member = must(m);
    await kit.tx
      .update(s.workspaceMembers)
      .set({ status, updatedAt: new Date() })
      .where(eq(s.workspaceMembers.id, memberId));
    await kit.audit({
      action: 'member.status_changed',
      entityType: 'member',
      entityId: memberId,
      before: { status: member.status },
      after: { status },
    });
    await kit.emit({
      type: 'member.status_changed',
      entityType: 'member',
      entityId: memberId,
      payload: { memberId, status },
    });
  });
}

/** Exceção individual: concede (grant) ou nega (deny) uma permissão; null remove a exceção. */
export async function setOverride(
  ctx: Ctx,
  memberId: string,
  permission: string,
  effect: 'grant' | 'deny' | null,
  scope: 'all' | 'team' | 'own' = 'all',
) {
  assertCan(ctx, 'members.manage');
  if (!(permission in PERMISSIONS)) throw badRequest('Permissão inválida.');
  return command('members.setOverride', ctx, async (kit) => {
    await kit.tx
      .delete(s.memberPermissionOverrides)
      .where(
        and(
          eq(s.memberPermissionOverrides.memberId, memberId),
          eq(s.memberPermissionOverrides.permissionKey, permission),
        ),
      );
    if (effect)
      await kit.tx
        .insert(s.memberPermissionOverrides)
        .values({ workspaceId: ctx.workspaceId, memberId, permissionKey: permission, effect, scope });
    await kit.audit({
      action: 'permission.changed',
      entityType: 'member',
      entityId: memberId,
      after: { permission, effect, scope },
    });
    await kit.emit({
      type: 'permission.changed',
      entityType: 'member',
      entityId: memberId,
      payload: { memberId, permission, effect },
    });
  });
}

export async function setRolePermission(
  ctx: Ctx,
  roleId: string,
  permission: string,
  scope: 'all' | 'team' | 'own' | null,
) {
  assertCan(ctx, 'members.manage');
  if (!(permission in PERMISSIONS)) throw badRequest('Permissão inválida.');
  return command('members.setRolePermission', ctx, async (kit) => {
    const [r] = await kit.tx.select().from(s.roles).where(eq(s.roles.id, roleId));
    const role = must(r);
    if (role.key === 'admin') throw forbidden('O cargo Admin sempre tem todas as permissões.');
    await kit.tx
      .delete(s.rolePermissions)
      .where(and(eq(s.rolePermissions.roleId, roleId), eq(s.rolePermissions.permissionKey, permission)));
    if (scope)
      await kit.tx
        .insert(s.rolePermissions)
        .values({ workspaceId: ctx.workspaceId, roleId, permissionKey: permission, scope });
    await kit.audit({
      action: 'permission.changed',
      entityType: 'role',
      entityId: roleId,
      after: { role: role.key, permission, scope },
    });
  });
}

export async function createInvite(ctx: Ctx, input: { email: string; name?: string; roleKeys: string[] }) {
  assertCan(ctx, 'members.manage');
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('E-mail inválido.');
  if (!input.roleKeys.length || input.roleKeys.some((k) => !SYSTEM_ROLES[k]))
    throw badRequest('Escolha ao menos um cargo válido.');
  return command('members.invite', ctx, async (kit) => {
    const token = randomBytes(24).toString('base64url');
    const [inv] = await kit.tx
      .insert(s.invitations)
      .values({
        workspaceId: ctx.workspaceId,
        email,
        name: input.name,
        roleKeys: input.roleKeys,
        token,
        invitedBy: ctx.memberId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning();
    await kit.audit({
      action: 'member.invited',
      entityType: 'invitation',
      entityId: inv!.id,
      after: { email, roleKeys: input.roleKeys },
    });
    await kit.emit({
      type: 'member.invited',
      entityType: 'invitation',
      entityId: inv!.id,
      payload: { email, roleKeys: input.roleKeys },
    });
    return inv!;
  });
}

export async function listInvites(ctx: Ctx) {
  assertCan(ctx, 'members.manage');
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.invitations)
      .where(and(isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt))),
  );
}

export async function revokeInvite(ctx: Ctx, id: string) {
  assertCan(ctx, 'members.manage');
  return command('members.revokeInvite', ctx, async (kit) => {
    await kit.tx.update(s.invitations).set({ revokedAt: new Date() }).where(eq(s.invitations.id, id));
    await kit.audit({ action: 'member.invite_revoked', entityType: 'invitation', entityId: id });
  });
}

/** Convite por token (antes do login): o token é a credencial; busca atravessa workspaces (papel dono). */
export async function findInvite(token: string) {
  const [inv] = await adminDb()
    .select({ i: s.invitations, workspace: s.workspaces.name })
    .from(s.invitations)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.invitations.workspaceId))
    .where(eq(s.invitations.token, token));
  if (!inv || inv.i.acceptedAt || inv.i.revokedAt || inv.i.expiresAt < new Date()) return null;
  return inv;
}

/** Aceite: cria o vínculo do usuário (já autenticado pelo Better Auth) com o workspace e os cargos. */
export async function acceptInvite(token: string, userId: string) {
  const inv = await findInvite(token);
  if (!inv) throw badRequest('Convite inválido ou expirado.');
  const ws = inv.i.workspaceId;
  const ctx = { workspaceId: ws, userId, actorType: 'user' as const };
  await runCommand('members.acceptInvite', ctx, async (kit) => {
    const { tx } = kit;
    const [m] = await tx
      .insert(s.workspaceMembers)
      .values({ workspaceId: ws, userId, status: 'active' })
      .onConflictDoUpdate({
        target: [s.workspaceMembers.workspaceId, s.workspaceMembers.userId],
        set: { status: 'active' },
      })
      .returning();
    const roles = await tx.select().from(s.roles).where(inArray(s.roles.key, inv.i.roleKeys));
    if (roles.length)
      await tx
        .insert(s.memberRoles)
        .values(roles.map((r) => ({ workspaceId: ws, memberId: m!.id, roleId: r.id })))
        .onConflictDoNothing();
    await tx.update(s.invitations).set({ acceptedAt: new Date() }).where(eq(s.invitations.id, inv.i.id));
    await kit.audit({
      action: 'member.joined',
      entityType: 'member',
      entityId: m!.id,
      after: { roles: inv.i.roleKeys },
    });
    await kit.emit({
      type: 'member.joined',
      entityType: 'member',
      entityId: m!.id,
      payload: { memberId: m!.id },
    });
  });
  return { workspaceId: ws };
}

export async function memberOptions(ctx: Ctx) {
  return read(ctx, (tx) =>
    tx
      .select({ id: s.workspaceMembers.id, name: s.users.name })
      .from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.workspaceMembers.status, 'active'))
      .orderBy(asc(s.users.name)),
  );
}

/** Cadastro só existe por convite: usado pelo hook do Better Auth. */
export async function hasPendingInvite(email: string): Promise<boolean> {
  const rows = await adminDb()
    .select({ id: s.invitations.id })
    .from(s.invitations)
    .where(
      and(
        eq(s.invitations.email, email.toLowerCase()),
        isNull(s.invitations.acceptedAt),
        isNull(s.invitations.revokedAt),
      ),
    );
  return rows.length > 0;
}
