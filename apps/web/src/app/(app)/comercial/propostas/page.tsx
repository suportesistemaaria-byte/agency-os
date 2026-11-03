import Link from 'next/link';
import { listProposals } from '@aos/domain';
import { dateShort, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Empty, PageHeader, Pill, Table } from '@/components/ui';
import { PROPOSAL_STATUS } from '@/components/domain-ui';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage() {
  const ctx = await requirePerm('comercial.view');
  const rows = await listProposals(ctx);
  return (
    <div>
      <PageHeader
        eyebrow="Comercial"
        title="Propostas"
        subtitle="Versões imutáveis; enviar cria follow-ups D+2, D+5 e D+10 automaticamente."
      />
      {rows.length ? (
        <Table head={['Número', 'Empresa', 'Título', 'Versão', 'MRR', 'Setup', 'Status', 'Enviada']}>
          {rows.map((r) => (
            <tr key={r.p.id} className="hover:bg-side">
              <td className="font-mono">{r.p.number}</td>
              <td>
                <Link href={`/comercial/oportunidades/${r.opportunityId}`} className="font-medium">
                  {r.org}
                </Link>
              </td>
              <td>{r.p.title}</td>
              <td className="font-mono">v{r.p.currentVersion}</td>
              <td className="num">{money(r.mrr)}</td>
              <td className="num">{money(r.setup)}</td>
              <td>
                <Pill tone={PROPOSAL_STATUS[r.p.status]![1]}>{PROPOSAL_STATUS[r.p.status]![0]}</Pill>
              </td>
              <td className="text-muted">{r.p.sentAt ? dateShort(r.p.sentAt) : '—'}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhuma proposta">Crie a primeira dentro de uma oportunidade.</Empty>
      )}
    </div>
  );
}
