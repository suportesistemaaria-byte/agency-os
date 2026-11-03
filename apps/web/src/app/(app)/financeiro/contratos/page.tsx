import Link from 'next/link';
import { listContracts } from '@aos/domain';
import { dateFull, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { PageHeader, Pill, Stats, Table } from '@/components/ui';
import { ConfirmContract } from './actions';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const ctx = await requirePerm('financeiro.view');
  const rows = await listContracts(ctx);
  const active = rows.filter((r) => r.status === 'active');
  const pending = rows.filter((r) => r.status === 'pending_finance_confirmation');
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Contratos"
        subtitle="Faturas só são geradas depois que o Financeiro confirma o contrato (decisão 5 da V3)."
      />
      <Stats
        items={[
          { label: 'Vigentes', value: active.length, tone: 'ok' },
          { label: 'MRR contratado', value: money(active.reduce((a, r) => a + r.mrrCents, 0)) },
          {
            label: 'Aguardando confirmação',
            value: pending.length,
            tone: pending.length ? 'info' : 'neutral',
          },
        ]}
      />
      <Table head={['Contrato', 'Cliente', 'Vigência', 'Cobrança', 'Setup', 'MRR', 'Status', '']}>
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-side">
            <td className="font-mono">{c.number}</td>
            <td>
              <Link href={`/clientes/${c.clientId}`} className="font-medium">
                {c.clientName}
              </Link>
            </td>
            <td>
              {dateFull(c.startOn)} a {dateFull(c.endOn)}
            </td>
            <td>dia {c.billingDay}</td>
            <td className="num">{money(c.setupCents)}</td>
            <td className="num font-medium">{money(c.mrrCents)}</td>
            <td>
              {c.status === 'active' ? (
                <Pill tone="ok">Vigente</Pill>
              ) : c.status === 'pending_finance_confirmation' ? (
                <Pill tone="info">Aguardando Financeiro</Pill>
              ) : (
                <Pill>{c.status}</Pill>
              )}
            </td>
            <td>
              {c.status === 'pending_finance_confirmation' && ctx.perms.has('financeiro.edit') && (
                <ConfirmContract id={c.id} />
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
