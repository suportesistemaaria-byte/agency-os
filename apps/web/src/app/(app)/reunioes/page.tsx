import Link from 'next/link';
import { listMeetings } from '@aos/domain';
import { dateTime } from '@aos/domain/format';
import { requireCtx } from '@/server/session';
import { Empty, PageHeader, Table, Tabs } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const ctx = await requireCtx();
  const t = (await searchParams).t ?? 'next';
  const now = new Date();
  const rows =
    t === 'next'
      ? await listMeetings(
          ctx,
          new Date(now.getTime() - 2 * 3600_000),
          new Date(now.getTime() + 60 * 86_400_000),
        )
      : (await listMeetings(ctx, new Date(now.getTime() - 90 * 86_400_000), now)).reverse();
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Reuniões"
        subtitle="Ata e decisões: cada decisão vira tarefa com responsável."
        actions={
          <Tabs
            active={t}
            items={[
              { key: 'next', label: 'Próximas', href: '?t=next' },
              { key: 'past', label: 'Anteriores', href: '?t=past' },
            ]}
          />
        }
      />
      {rows.length ? (
        <Table head={['Quando', 'Reunião', 'Cliente', 'Local', 'Participantes']}>
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-side">
              <td className="font-mono text-[12.5px]">{dateTime(m.startsAt)}</td>
              <td>
                <Link href={`/reunioes/${m.id}`} className="font-medium">
                  {m.title}
                </Link>
              </td>
              <td>{m.clientName ?? '—'}</td>
              <td>{m.location ?? '—'}</td>
              <td className="text-muted">{m.participants.map((p) => p.name).join(', ')}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhuma reunião">Use Criar → Reunião.</Empty>
      )}
    </div>
  );
}
