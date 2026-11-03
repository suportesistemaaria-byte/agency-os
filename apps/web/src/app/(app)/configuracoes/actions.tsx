'use client';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/trpc';
import { Menu, Modal, useAction } from '@/components/client';
import { Button, Field, Input, Pill, Select, cx } from '@/components/ui';

type Role = { key: string; name: string };

export function MemberRow({
  m,
  roles,
  permissions,
  self,
  avatar,
}: {
  m: {
    id: string;
    name: string;
    email: string;
    status: string;
    twoFactor: boolean;
    roles: string[];
    overrides: string[];
  };
  roles: Role[];
  permissions: { key: string; label: string }[];
  self: boolean;
  avatar: ReactNode;
}) {
  const { run } = useAction();
  const [edit, setEdit] = useState<null | 'roles' | 'override'>(null);
  const [sel, setSel] = useState<string[]>(m.roles);
  const [perm, setPerm] = useState('');
  const [effect, setEffect] = useState<'grant' | 'deny' | 'none'>('grant');
  const needs2fa = m.roles.some((r) => r === 'admin' || r === 'financeiro');
  return (
    <tr className="hover:bg-side">
      <td>
        <span className="flex items-center gap-2.5">
          {avatar}
          <span>
            <span className="block font-medium">{m.name}</span>
            <span className="text-[12px] text-muted">{m.email}</span>
          </span>
        </span>
      </td>
      <td>{m.roles.map((k) => roles.find((r) => r.key === k)?.name ?? k).join(' · ')}</td>
      <td className="font-mono text-[11.5px]">{m.overrides.join(' ') || '—'}</td>
      <td>
        {m.twoFactor ? (
          <Pill tone="ok">Ativo</Pill>
        ) : needs2fa ? (
          <Pill tone="warn">Obrigatório (pendente)</Pill>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td>{m.status === 'active' ? <Pill tone="ok">Ativo</Pill> : <Pill tone="neutral">Desativado</Pill>}</td>
      <td>
        <Menu
          trigger={<Button size="sm">Editar</Button>}
          items={[
            { label: 'Cargos', onSelect: () => setEdit('roles') },
            { label: 'Exceção individual', onSelect: () => setEdit('override') },
            ...(!self
              ? [
                  {
                    label: m.status === 'active' ? 'Desativar' : 'Reativar',
                    danger: m.status === 'active',
                    onSelect: () =>
                      void run(
                        () =>
                          api.members.setStatus.mutate({
                            memberId: m.id,
                            status: m.status === 'active' ? 'suspended' : 'active',
                          }),
                        m.status === 'active'
                          ? 'Membro desativado (não consegue mais entrar).'
                          : 'Membro reativado.',
                      ),
                  },
                ]
              : []),
          ]}
        />
        <Modal
          open={edit === 'roles'}
          onOpenChange={(o) => !o && setEdit(null)}
          title={`Cargos de ${m.name}`}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancelar</Button>
              <Button
                variant="primary"
                disabled={!sel.length}
                onClick={() =>
                  run(
                    () => api.members.setRoles.mutate({ memberId: m.id, roleKeys: sel }),
                    'Cargos atualizados.',
                  ).then((r) => r !== undefined && setEdit(null))
                }
              >
                Salvar
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {roles.map((r) => (
              <label
                key={r.key}
                className={cx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  sel.includes(r.key) ? 'border-ink' : 'border-line',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[#1a1a18]"
                  checked={sel.includes(r.key)}
                  onChange={(e) =>
                    setSel(e.target.checked ? [...sel, r.key] : sel.filter((x) => x !== r.key))
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </Modal>
        <Modal
          open={edit === 'override'}
          onOpenChange={(o) => !o && setEdit(null)}
          title={`Exceção individual · ${m.name}`}
          footer={
            <>
              <Button onClick={() => setEdit(null)}>Cancelar</Button>
              <Button
                variant="primary"
                disabled={!perm}
                onClick={() =>
                  run(
                    () =>
                      api.members.setOverride.mutate({
                        memberId: m.id,
                        permission: perm,
                        effect: effect === 'none' ? null : effect,
                      }),
                    'Exceção salva.',
                  ).then((r) => r !== undefined && setEdit(null))
                }
              >
                Salvar
              </Button>
            </>
          }
        >
          <p className="text-muted">
            Permissões efetivas = cargos + concessões individuais − negações individuais.
          </p>
          <Field label="Permissão">
            <Select value={perm} onChange={(e) => setPerm(e.target.value)}>
              <option value="">Selecione…</option>
              {permissions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.key})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Efeito">
            <Select value={effect} onChange={(e) => setEffect(e.target.value as 'grant')}>
              <option value="grant">Conceder</option>
              <option value="deny">Negar</option>
              <option value="none">Remover exceção</option>
            </Select>
          </Field>
        </Modal>
      </td>
    </tr>
  );
}

export function InviteForm({ roles, base }: { roles: Role[]; base: string }) {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('designer');
  const [link, setLink] = useState('');
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => (setOpen(true), setLink(''))}>
        Convidar
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Convidar por link"
        footer={
          link ? (
            <Button onClick={() => setOpen(false)}>Fechar</Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const r = await run(
                    () => api.members.invite.mutate({ email, name: name || undefined, roleKeys: [role] }),
                    'Convite criado.',
                  );
                  if (r) setLink(`${base}/convite/${r.token}`);
                }}
              >
                Gerar link
              </Button>
            </>
          )
        }
      >
        {link ? (
          <>
            <p className="text-muted">
              Envie este link para {email} (em dev, o e-mail não é enviado; copie o link):
            </p>
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
          </>
        ) : (
          <>
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Cargo inicial">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const { run } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => run(() => api.members.revokeInvite.mutate({ id }), 'Convite revogado.')}
    >
      Revogar
    </Button>
  );
}

const NEXT: Record<string, 'all' | 'team' | 'own' | null> = {
  '': 'own',
  own: 'team',
  team: 'all',
  all: null,
};
export function ScopeCell({
  roleId,
  permission,
  scope,
  locked,
}: {
  roleId: string;
  permission: string;
  scope: string | null;
  locked: boolean;
}) {
  const { run } = useAction();
  const label = { all: 'tudo', team: 'equipe', own: 'próprio' }[scope ?? ''] ?? '—';
  return (
    <button
      disabled={locked}
      title={locked ? 'Admin sempre tem tudo' : 'Clique para alternar: — → próprio → equipe → tudo'}
      onClick={() =>
        run(
          () => api.members.setRolePermission.mutate({ roleId, permission, scope: NEXT[scope ?? '']! }),
          'Permissão do cargo atualizada.',
        )
      }
      className={cx(
        'w-16 rounded-md px-1.5 py-0.5 text-[11.5px]',
        scope === 'all'
          ? 'bg-ink text-white'
          : scope === 'team'
            ? 'bg-info-bg text-info'
            : scope === 'own'
              ? 'bg-warn-bg text-warn'
              : 'text-faint',
      )}
    >
      {label}
    </button>
  );
}
