/**
 * RBAC com escopo (V3, seção 5). Funções puras: testáveis sem banco.
 * Permissões efetivas = união dos cargos + concessões individuais − negações individuais.
 */
export type Scope = 'all' | 'team' | 'own';
export type Perms = Map<string, Scope>;

const RANK: Record<Scope, number> = { own: 1, team: 2, all: 3 };
export const widest = (a: Scope | undefined, b: Scope): Scope => (!a || RANK[b] > RANK[a] ? b : a);

export interface GrantRow {
  permissionKey: string;
  scope: Scope;
}
export interface OverrideRow extends GrantRow {
  effect: 'grant' | 'deny';
}

export function effectivePermissions(roleGrants: GrantRow[], overrides: OverrideRow[] = []): Perms {
  const perms: Perms = new Map();
  for (const g of roleGrants) perms.set(g.permissionKey, widest(perms.get(g.permissionKey), g.scope));
  for (const o of overrides.filter((x) => x.effect === 'grant'))
    perms.set(o.permissionKey, widest(perms.get(o.permissionKey), o.scope));
  for (const o of overrides.filter((x) => x.effect === 'deny')) perms.delete(o.permissionKey);
  return perms;
}

export interface PermSubject {
  memberId: string;
  perms: Perms;
  /** Clientes em que o membro está na equipe da conta (escopo team). */
  teamClientIds: ReadonlySet<string>;
}

export interface Resource {
  clientId?: string | null;
  /** Membros "donos" do recurso: responsável, participantes, autor. */
  ownerMemberIds?: (string | null | undefined)[];
}

/**
 * can(ctx, perm, resource?) — sem recurso: tem a permissão em algum escopo.
 * Com recurso: all = tudo; team = clientes da equipe (ou próprio); own = só o que é seu.
 */
export function can(subject: PermSubject, perm: string, resource?: Resource): boolean {
  const scope = subject.perms.get(perm);
  if (!scope) return false;
  if (!resource || scope === 'all') return true;
  const own = (resource.ownerMemberIds ?? []).includes(subject.memberId);
  if (own) return true;
  if (scope === 'team') return Boolean(resource.clientId && subject.teamClientIds.has(resource.clientId));
  return false;
}

export function scopeOf(subject: PermSubject, perm: string): Scope | null {
  return subject.perms.get(perm) ?? null;
}
