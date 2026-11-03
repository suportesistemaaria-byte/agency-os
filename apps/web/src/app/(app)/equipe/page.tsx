import { teamLoad } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { Avatar, PageHeader, Pill, Stats, Table } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const ctx = await requirePerm('members.manage');
  const rows = await teamLoad(ctx);
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Equipe"
        subtitle="Carga de trabalho por pessoa (tarefas abertas, atrasos e prazos da semana)."
      />
      <Stats
        items={[
          { label: 'Pessoas ativas', value: rows.length },
          { label: 'Tarefas abertas', value: rows.reduce((a, r) => a + r.open, 0) },
          {
            label: 'Atrasadas',
            value: rows.reduce((a, r) => a + r.overdue, 0),
            tone: rows.some((r) => r.overdue) ? 'bad' : 'neutral',
          },
          {
            label: 'Sobrecarregadas',
            value: rows.filter((r) => r.load === 'high').length,
            tone: rows.some((r) => r.load === 'high') ? 'warn' : 'neutral',
          },
        ]}
      />
      <Table
        head={[
          'Pessoa',
          'Cargos',
          'Contas',
          'Abertas',
          'Atrasadas',
          'Vencem em 7 dias',
          'Em revisão',
          'Bloqueadas',
          'Concluídas (30d)',
          'Carga',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="inline-flex items-center gap-2">
                <Avatar name={r.name} />
                {r.name}
              </span>
            </td>
            <td className="text-muted">{r.roles.join(' · ')}</td>
            <td className="num">{r.accounts}</td>
            <td className="num font-medium">{r.open}</td>
            <td className={`num ${r.overdue ? 'font-semibold text-bad' : ''}`}>{r.overdue}</td>
            <td className="num">{r.week}</td>
            <td className="num">{r.review}</td>
            <td className="num">{r.blocked}</td>
            <td className="num">{r.done30}</td>
            <td>
              {r.load === 'high' ? (
                <Pill tone="bad">Alta</Pill>
              ) : r.load === 'medium' ? (
                <Pill tone="warn">Média</Pill>
              ) : (
                <Pill tone="ok">Leve</Pill>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
