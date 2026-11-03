import { describe, expect, it } from 'vitest';
import { SYSTEM_ROLES } from '@aos/db';
import { can, effectivePermissions, type PermSubject } from './permissions';

const subject = (roles: string[], extra: Partial<PermSubject> = {}): PermSubject => ({
  memberId: 'm1',
  teamClientIds: new Set(['c-team']),
  perms: effectivePermissions(
    roles.flatMap((r) => SYSTEM_ROLES[r]!.grants.map(([permissionKey, scope]) => ({ permissionKey, scope }))),
  ),
  ...extra,
});

describe('permissões efetivas', () => {
  it('união dos cargos usa o escopo mais amplo', () => {
    const p = effectivePermissions([
      { permissionKey: 'tasks.edit', scope: 'own' },
      { permissionKey: 'tasks.edit', scope: 'team' },
    ]);
    expect(p.get('tasks.edit')).toBe('team');
  });
  it('concessão individual amplia e negação individual remove', () => {
    const p = effectivePermissions(
      [{ permissionKey: 'clientes.view', scope: 'team' }],
      [
        { permissionKey: 'clientes.view', scope: 'all', effect: 'grant' },
        { permissionKey: 'reports.view', scope: 'all', effect: 'grant' },
        { permissionKey: 'reports.view', scope: 'all', effect: 'deny' },
      ],
    );
    expect(p.get('clientes.view')).toBe('all');
    expect(p.has('reports.view')).toBe(false);
  });
});

describe('can() com escopos', () => {
  it('designer não vê financeiro (aceite da Sprint 1)', () => {
    expect(can(subject(['designer']), 'financeiro.view')).toBe(false);
  });
  it('financeiro vê financeiro; comercial não', () => {
    expect(can(subject(['financeiro']), 'financeiro.view')).toBe(true);
    expect(can(subject(['comercial']), 'financeiro.view')).toBe(false);
  });
  it('escopo own: só o que é seu', () => {
    const d = subject(['designer']);
    expect(can(d, 'tasks.edit', { ownerMemberIds: ['m1'] })).toBe(true);
    expect(can(d, 'tasks.edit', { ownerMemberIds: ['m2'], clientId: 'c-team' })).toBe(false);
  });
  it('escopo team: clientes da equipe da conta', () => {
    const d = subject(['designer']);
    expect(can(d, 'clientes.view', { clientId: 'c-team' })).toBe(true);
    expect(can(d, 'clientes.view', { clientId: 'c-outro' })).toBe(false);
  });
  it('escopo all: tudo do workspace', () => {
    expect(can(subject(['gestor']), 'tasks.edit', { clientId: 'qualquer', ownerMemberIds: ['x'] })).toBe(
      true,
    );
  });
  it('múltiplos cargos somam permissões', () => {
    const s = subject(['designer', 'financeiro']);
    expect(can(s, 'financeiro.edit')).toBe(true);
    expect(can(s, 'conteudo.create', { clientId: 'c-team' })).toBe(true);
  });
  it('aprovação em nome exige permissão própria', () => {
    expect(can(subject(['atendimento']), 'conteudo.approve_on_behalf')).toBe(false);
    expect(can(subject(['gestor']), 'conteudo.approve_on_behalf')).toBe(true);
  });
  it('sem a permissão, nenhum escopo vale', () => {
    expect(can(subject(['trafego']), 'comercial.view')).toBe(false);
  });
});
