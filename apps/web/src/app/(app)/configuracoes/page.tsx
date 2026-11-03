import { listInvites, listMembers, listRolesMatrix } from '@aos/domain';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Avatar, Card, Pill, Table } from '@/components/ui';
import { InviteForm, MemberRow, RevokeInvite } from './actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const ctx = await requirePerm('members.manage');
  const [members, invites, matrix] = await Promise.all([
    listMembers(ctx),
    listInvites(ctx),
    listRolesMatrix(ctx),
  ]);
  const roles = matrix.roles.map((r) => ({ key: r.key, name: r.name }));
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return (
    <div className="space-y-6">
      <Table head={['Pessoa', 'Cargos (vários por pessoa)', 'Exceções', '2FA', 'Status', '']}>
        {members.map((m) => (
          <MemberRow
            key={m.id}
            m={{
              id: m.id,
              name: m.name,
              email: m.email,
              status: m.status,
              twoFactor: m.twoFactor,
              roles: m.roles.map((r) => r.key),
              overrides: m.overrides.map((o) => `${o.effect === 'grant' ? '+' : '−'}${o.permissionKey}`),
            }}
            roles={roles}
            permissions={matrix.permissions}
            self={m.id === ctx.memberId}
            avatar={<Avatar name={m.name} />}
          />
        ))}
      </Table>
      <Card title="Convites" action={<InviteForm roles={roles} base={base} />} pad={false}>
        {invites.length ? (
          invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              <span className="flex-1">
                <span className="font-medium">{i.email}</span>
                <span className="block font-mono text-[11.5px] text-muted">
                  {base}/convite/{i.token}
                </span>
              </span>
              <span className="text-[12px] text-muted">{i.roleKeys.join(', ')}</span>
              <Pill tone="info">expira {dateShort(i.expiresAt)}</Pill>
              <RevokeInvite id={i.id} />
            </div>
          ))
        ) : (
          <div className="px-5 py-4 text-muted">
            Nenhum convite pendente. Convide por link: a pessoa cria a própria senha.
          </div>
        )}
      </Card>
    </div>
  );
}
