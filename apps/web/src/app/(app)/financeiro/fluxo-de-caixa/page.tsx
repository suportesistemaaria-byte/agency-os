import { cashFlow, resultByCategory } from '@aos/domain';
import { dateShort, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, PageHeader, Stats, Table, cx } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const ctx = await requirePerm('financeiro.view');
  const [cf, dre] = await Promise.all([cashFlow(ctx), resultByCategory(ctx)]);
  const max = Math.max(1, ...cf.realized.flatMap((r) => [r.inCents, r.outCents]));
  const last = cf.projected[cf.projected.length - 1];
  const minBal = Math.min(...cf.projected.map((p) => p.balanceCents));
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Fluxo de caixa"
        subtitle="Realizado pela data de caixa; projeção semanal pelos vencimentos em aberto."
      />
      <Stats
        items={[
          {
            label: 'Saldo realizado (6 meses)',
            value: money(cf.realized.reduce((a, r) => a + r.netCents, 0)),
          },
          {
            label: 'Saldo projetado (12 semanas)',
            value: money(last?.balanceCents ?? 0),
            tone: (last?.balanceCents ?? 0) < 0 ? 'bad' : 'ok',
          },
          {
            label: 'Menor saldo projetado',
            value: money(minBal),
            tone: minBal < 0 ? 'bad' : 'neutral',
            hint: minBal < 0 ? 'atenção: caixa negativo no período' : 'sem caixa negativo',
          },
          {
            label: 'Atrasado a receber',
            value: money(cf.overdueInCents),
            tone: cf.overdueInCents ? 'warn' : 'neutral',
            hint: 'entra na 1ª semana da projeção',
          },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Realizado por mês"
          action={
            <span className="flex gap-3 text-[12px] text-muted">
              <span>■ Entradas</span>
              <span className="text-faint">■ Saídas</span>
            </span>
          }
        >
          <div className="flex h-52 items-end justify-around gap-4 border-b border-line">
            {cf.realized.map((r) => (
              <div
                key={r.period}
                className="flex h-full items-end gap-1.5"
                title={`${r.period}: +${money(r.inCents)} / −${money(r.outCents)}`}
              >
                <div className="w-6 rounded-t bg-ink" style={{ height: `${(r.inCents / max) * 100}%` }} />
                <div
                  className="w-6 rounded-t bg-[#d9d7d0]"
                  style={{ height: `${(r.outCents / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-around pt-2 font-mono text-[11px] text-faint uppercase">
            {cf.realized.map((r) => (
              <span key={r.period}>
                {new Date(`${r.period}-15T12:00:00Z`)
                  .toLocaleDateString('pt-BR', { month: 'short' })
                  .replace('.', '')}
              </span>
            ))}
          </div>
        </Card>
        <Card title={`Resultado da competência ${dre.period}`} pad={false}>
          <div className="flex justify-between border-b border-line px-5 py-2.5">
            <span>Faturado</span>
            <span className="num font-medium">{money(dre.invoicedCents)}</span>
          </div>
          {dre.categories.map((c) => (
            <div
              key={c.category}
              className="flex justify-between border-b border-line px-5 py-2.5 text-muted"
            >
              <span>
                − {c.category}{' '}
                <span className="text-faint">· {c.kind === 'fixed' ? 'fixa' : 'variável'}</span>
              </span>
              <span className="num">{money(c.cents)}</span>
            </div>
          ))}
          <div className="flex justify-between px-5 py-3 font-semibold">
            <span>Resultado</span>
            <span className={cx('num', dre.resultCents < 0 && 'text-bad')}>{money(dre.resultCents)}</span>
          </div>
        </Card>
      </div>
      <div className="mt-6">
        <Table head={['Semana de', 'Entradas previstas', 'Saídas previstas', 'Líquido', 'Saldo acumulado']}>
          {cf.projected.map((p) => (
            <tr key={p.weekStart}>
              <td>{dateShort(p.weekStart)}</td>
              <td className="num text-ok">{money(p.inCents)}</td>
              <td className="num text-bad">{money(p.outCents)}</td>
              <td className={cx('num', p.netCents < 0 && 'text-bad')}>{money(p.netCents)}</td>
              <td className={cx('num font-medium', p.balanceCents < 0 && 'text-bad')}>
                {money(p.balanceCents)}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
