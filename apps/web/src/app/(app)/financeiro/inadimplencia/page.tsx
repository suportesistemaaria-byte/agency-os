import Link from 'next/link';
import { delinquency } from '@aos/domain';
import { money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Empty, PageHeader, Pill, Stats, Table } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DelinquencyPage() {
  const ctx = await requirePerm('financeiro.view');
  const d = await delinquency(ctx);
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Inadimplência"
        subtitle="Saldo vencido por cliente e faixa de atraso. Cobrança atrasada também pesa no Health score."
      />
      <Stats
        items={[
          {
            label: 'Total vencido',
            value: money(d.totals.totalCents),
            tone: d.totals.totalCents ? 'bad' : 'ok',
          },
          {
            label: 'Taxa de inadimplência',
            value: `${(d.rate * 100).toFixed(1)}%`,
            hint: 'vencido ÷ total em aberto',
          },
          { label: '1–30 dias', value: money(d.totals.d1_30) },
          { label: '31–60 dias', value: money(d.totals.d31_60), tone: d.totals.d31_60 ? 'warn' : 'neutral' },
          { label: '61–90 dias', value: money(d.totals.d61_90), tone: d.totals.d61_90 ? 'bad' : 'neutral' },
          { label: '90+ dias', value: money(d.totals.d90p), tone: d.totals.d90p ? 'bad' : 'neutral' },
        ]}
      />
      {d.clients.length ? (
        <Table head={['Cliente', 'Cobranças', 'Atraso máximo', '1–30', '31–60', '61–90', '90+', 'Total']}>
          {d.clients.map((c) => (
            <tr key={c.clientId} className="hover:bg-side">
              <td>
                <Link href={`/clientes/${c.clientId}?tab=financeiro`} className="font-medium">
                  {c.clientName}
                </Link>
              </td>
              <td>{c.invoices}</td>
              <td>
                <Pill tone={c.oldestDays > 30 ? 'bad' : 'warn'}>{c.oldestDays} dias</Pill>
              </td>
              <td className="num">{money(c.buckets.d1_30)}</td>
              <td className="num">{money(c.buckets.d31_60)}</td>
              <td className="num">{money(c.buckets.d61_90)}</td>
              <td className="num">{money(c.buckets.d90p)}</td>
              <td className="num font-semibold text-bad">{money(c.totalCents)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhuma cobrança vencida">Carteira em dia.</Empty>
      )}
    </div>
  );
}
