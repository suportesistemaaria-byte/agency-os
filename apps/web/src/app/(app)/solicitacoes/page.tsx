import Link from 'next/link';
import { listRequests } from '@aos/domain';
import { REQUEST_FLOW, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@aos/domain/labels';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Avatar, ClientTag, PageHeader, Stats, Tabs } from '@/components/ui';
import { SlaPill } from '@/components/domain-ui';

export const dynamic = 'force-dynamic';

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const ctx = await requirePerm('requests.view');
  const v = (await searchParams).v ?? 'board';
  const all = await listRequests(ctx);
  const open = all.filter((r) => r.status !== 'delivered' && r.status !== 'cancelled');
  const count = (s: string) => open.filter((r) => r.sla?.status === s).length;
  return (
    <div>
      <PageHeader
        eyebrow="Operação"
        title="Solicitações"
        subtitle="Recebida → Triagem → Responsável → Em produção → Revisão → Aprovação → Entregue"
        actions={
          <Tabs
            active={v}
            items={[
              { key: 'board', label: 'Fluxo', href: '?v=board' },
              { key: 'list', label: 'Lista', href: '?v=list' },
            ]}
          />
        }
      />
      <Stats
        items={[
          { label: 'No prazo', value: count('on_time'), tone: 'ok' },
          { label: 'Próximo', value: count('near_due'), tone: 'warn' },
          { label: 'Atrasado', value: count('overdue'), tone: count('overdue') ? 'bad' : 'neutral' },
          { label: 'Pausado (cliente)', value: count('paused') },
          { label: 'Bloqueado', value: count('blocked') },
        ]}
      />
      {v === 'board' ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
          {REQUEST_FLOW.filter((s) => s !== 'received').map((s) => {
            const items = all.filter((r) => r.status === s);
            return (
              <div key={s} className="flex w-[250px] shrink-0 flex-col gap-2 rounded-[10px] bg-side p-2">
                <div className="px-1 pt-1 font-semibold">
                  {REQUEST_STATUS_LABEL[s]}{' '}
                  <span className="ml-1 text-[12px] font-normal text-faint">{items.length}</span>
                </div>
                {items.map((r) => (
                  <Link
                    key={r.id}
                    href={`/solicitacoes/${r.id}`}
                    className="rounded-[9px] border border-line bg-white p-3 hover:border-[#d9d7d0]"
                  >
                    <div className="font-medium">{r.title}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <ClientTag name={r.clientName} color={r.clientColor} />
                      {r.assigneeName && <Avatar name={r.assigneeName} size={18} />}
                    </div>
                    <div className="mt-1 text-[12px] text-muted">
                      {REQUEST_TYPE_LABEL[r.type]}
                      {r.urgent ? ' · urgente' : ''}
                      {!r.inScope ? ' · fora do escopo' : ''}
                    </div>
                    <div className="mt-2">
                      <SlaPill sla={r.sla} showDue={false} />
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                {['Solicitação', 'Cliente', 'Tipo', 'Status', 'Responsável', 'SLA', 'Recebida'].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-side [&>td]:px-4 [&>td]:py-3"
                >
                  <td>
                    <Link href={`/solicitacoes/${r.id}`} className="font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td>
                    <ClientTag name={r.clientName} color={r.clientColor} />
                  </td>
                  <td>{REQUEST_TYPE_LABEL[r.type]}</td>
                  <td>{REQUEST_STATUS_LABEL[r.status]}</td>
                  <td>{r.assigneeName ?? '—'}</td>
                  <td>
                    <SlaPill sla={r.sla} />
                  </td>
                  <td className="text-muted">{dateShort(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
