import { listRolesMatrix } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { ScopeCell } from '../actions';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const ctx = await requirePerm('members.manage');
  const m = await listRolesMatrix(ctx);
  return (
    <div>
      <p className="mb-4 text-muted">
        Cargos são pacotes de permissões com escopo: <b>tudo</b> (workspace), <b>equipe</b> (clientes em que a
        pessoa está na equipe) e <b>próprio</b> (só o que é seu). Clique numa célula para alternar.
      </p>
      <div className="overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="sticky left-0 bg-white px-4 py-2.5 font-normal">Permissão</th>
              {m.roles.map((r) => (
                <th key={r.id} className="px-2 py-2.5 font-normal whitespace-nowrap">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.permissions.map((p) => (
              <tr key={p.key} className="border-b border-line last:border-0">
                <td className="sticky left-0 bg-white px-4 py-2">
                  <div>{p.label}</div>
                  <div className="font-mono text-[11px] text-faint">{p.key}</div>
                </td>
                {m.roles.map((r) => (
                  <td key={r.id} className="px-2 py-2">
                    <ScopeCell
                      roleId={r.id}
                      permission={p.key}
                      scope={r.grants.find((g) => g.permissionKey === p.key)?.scope ?? null}
                      locked={r.key === 'admin'}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
