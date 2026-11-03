import Link from 'next/link';
import { listLeads } from '@aos/domain';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Avatar, Empty, PageHeader, Pill, Table } from '@/components/ui';
import { TempPill } from '@/components/domain-ui';

export const dynamic = 'force-dynamic';
const STATE: Record<
  string,
  ['Aberta' | 'Sem resposta' | 'Pausada' | 'Perdida' | 'Ganha', 'info' | 'neutral' | 'bad' | 'ok']
> = {
  open: ['Aberta', 'info'],
  no_response: ['Sem resposta', 'neutral'],
  paused: ['Pausada', 'neutral'],
  lost: ['Perdida', 'bad'],
  won: ['Ganha', 'ok'],
};

export default async function LeadsPage() {
  const ctx = await requirePerm('comercial.view');
  const rows = await listLeads(ctx);
  return (
    <div>
      <PageHeader
        eyebrow="Comercial"
        title="Leads"
        subtitle={`${rows.length} leads · empresa e pessoa são compartilhadas com Clientes (sem recadastro)`}
      />
      {rows.length ? (
        <Table
          head={['Empresa', 'Contato', 'Origem', 'Temperatura', 'Etapa', 'Estado', 'Responsável', 'Criado']}
        >
          {rows.map((r) => (
            <tr key={r.lead.id} className="hover:bg-side">
              <td>
                {r.opportunityId ? (
                  <Link href={`/comercial/oportunidades/${r.opportunityId}`} className="font-medium">
                    {r.org.name}
                  </Link>
                ) : (
                  r.org.name
                )}
                <div className="text-[12px] text-faint">{r.org.segment ?? ''}</div>
              </td>
              <td>
                {r.person?.name ?? '—'}
                <div className="text-[12px] text-faint">{r.person?.email ?? ''}</div>
              </td>
              <td className="text-muted">
                {[r.lead.source, r.lead.campaign].filter(Boolean).join(' · ') || '—'}
              </td>
              <td>
                <TempPill t={r.lead.temperature} />
              </td>
              <td>{r.stage ?? '—'}</td>
              <td>{r.state && <Pill tone={STATE[r.state]![1]}>{STATE[r.state]![0]}</Pill>}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={r.owner} />
                  {r.owner}
                </span>
              </td>
              <td className="text-muted">{dateShort(r.lead.createdAt)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhum lead ainda">Use o botão Criar → Lead.</Empty>
      )}
    </div>
  );
}
