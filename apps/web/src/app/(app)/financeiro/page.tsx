import Link from 'next/link';
import { cashFlow, delinquency, financeOverview, resultByCategory } from '@aos/domain';
import { dateShort, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, PageHeader, Pill, Stats, cx } from '@/components/ui';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FinanceOverview() {
  const ctx = await requirePerm('financeiro.view');
  const [f, dl, cf, dre] = await Promise.all([
    financeOverview(ctx),
    delinquency(ctx),
    cashFlow(ctx),
    resultByCategory(ctx),
  ]);
  const s = f.summary;
  const max = Math.max(1, ...f.series.flatMap((x) => [x.receivedCents, x.expensesCents]));
  const label = new Date(`${f.period}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const concepts = [
    [
      'Pipeline potencial',
      'Comercial',
      s.pipelineCents,
      'MRR potencial das oportunidades abertas. É previsão e não entra em nenhum número financeiro.',
      'border-dashed text-muted',
    ],
    [
      'Contratado',
      'Contratos',
      s.contractedCents,
      'Valor comprometido em contratos vigentes na competência (recorrentes + setup que começa no mês).',
      '',
    ],
    [
      'Faturado',
      'Contas a receber',
      s.invoicedCents,
      'Cobranças emitidas para a competência, pagas ou não.',
      'bg-info-bg/60 border-[#cfe0f3] [&_.v]:text-info',
    ],
    [
      'Recebido',
      'Caixa',
      s.receivedCents,
      'Pagamentos com data de caixa no mês.',
      'bg-ok-bg/60 border-[#cfe6d7] [&_.v]:text-ok',
    ],
  ] as const;
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Visão geral"
        subtitle={`${label} · regime de competência para resultado e de caixa para recebido e pago.`}
      />
      <div className="mb-2 text-[12.5px] text-muted">Do potencial ao caixa · nunca somados entre si</div>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {concepts.map(([t, src, v, d, cls]) => (
          <div key={t} className={cx('rounded-[10px] border border-line p-5', cls)}>
            <div className="flex justify-between">
              <span className="font-semibold text-ink">{t}</span>
              <span className="text-[11.5px] text-faint">{src}</span>
            </div>
            <div className="v num mt-2 text-[26px] font-semibold">
              {money(v)}
              {t === 'Pipeline potencial' ? '/mês' : ''}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">{d}</p>
          </div>
        ))}
      </div>
      <Stats
        items={[
          { label: 'Receitas', value: money(s.receivedCents), tone: 'ok', hint: 'recebido no mês' },
          { label: 'Despesas', value: money(s.expensesCents), hint: 'competência do mês' },
          { label: 'A receber', value: money(s.receivableCents), tone: 'warn', hint: 'saldo em aberto' },
          { label: 'A pagar', value: money(s.payableCents), hint: 'despesas em aberto' },
          { label: 'Saldo do mês', value: money(s.cashBalanceCents), hint: 'recebido − pago' },
          { label: 'MRR', value: money(s.mrrCents), hint: 'contratos vigentes' },
          {
            label: 'Atrasado',
            value: money(s.overdueCents),
            tone: s.overdueCents ? 'bad' : 'neutral',
            hint: 'inadimplência',
          },
        ]}
      />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Link
          href="/financeiro/inadimplencia"
          className="rounded-[10px] border border-line p-4 hover:bg-side"
        >
          <div className="text-[12px] text-muted">Inadimplência</div>
          <div className="num mt-1 text-[20px] font-semibold text-bad">{money(dl.totals.totalCents)}</div>
          <div className="text-[12px] text-faint">
            {dl.clients.length} cliente(s) · {(dl.rate * 100).toFixed(1)}% do em aberto
          </div>
        </Link>
        <Link
          href="/financeiro/fluxo-de-caixa"
          className="rounded-[10px] border border-line p-4 hover:bg-side"
        >
          <div className="text-[12px] text-muted">Saldo projetado em 12 semanas</div>
          <div className="num mt-1 text-[20px] font-semibold">
            {money(cf.projected.at(-1)?.balanceCents ?? 0)}
          </div>
          <div className="text-[12px] text-faint">realizado + a receber − a pagar</div>
        </Link>
        <Link
          href="/financeiro/fluxo-de-caixa"
          className="rounded-[10px] border border-line p-4 hover:bg-side"
        >
          <div className="text-[12px] text-muted">Resultado da competência</div>
          <div className={`num mt-1 text-[20px] font-semibold ${dre.resultCents < 0 ? 'text-bad' : ''}`}>
            {money(dre.resultCents)}
          </div>
          <div className="text-[12px] text-faint">
            faturado − despesas ({dre.categories.length} categorias)
          </div>
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <Card
          title="Receitas e despesas"
          action={
            <span className="flex gap-3 text-[12px] text-muted">
              <span>■ Receitas</span>
              <span className="text-faint">■ Despesas</span>
            </span>
          }
        >
          <div className="flex h-56 items-end justify-around gap-4 border-b border-line">
            {f.series.map((x) => (
              <div key={x.period} className="flex h-full items-end gap-1.5">
                <div
                  className="w-6 rounded-t bg-ink"
                  style={{ height: `${(x.receivedCents / max) * 100}%` }}
                  title={money(x.receivedCents)}
                />
                <div
                  className="w-6 rounded-t bg-[#d9d7d0]"
                  style={{ height: `${(x.expensesCents / max) * 100}%` }}
                  title={money(x.expensesCents)}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-around pt-2 font-mono text-[11px] text-faint uppercase">
            {f.series.map((x) => (
              <span key={x.period}>
                {new Date(`${x.period}-15T12:00:00Z`)
                  .toLocaleDateString('pt-BR', { month: 'short' })
                  .replace('.', '')}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Próximos vencimentos" pad={false}>
          {f.upcoming.map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
              {u.kind === 'in' ? (
                <ArrowDownLeft size={16} className="text-ok" />
              ) : (
                <ArrowUpRight size={16} className="text-bad" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.label}</span>
                <span className="block truncate text-[12px] text-muted">
                  {u.sub} · {dateShort(u.dueOn)}
                </span>
              </span>
              <span className="num font-medium">{money(u.cents)}</span>
              {u.overdue ? (
                <Pill tone="bad" dot={false} className="!bg-bad !text-white">
                  Atrasado
                </Pill>
              ) : (
                <Pill tone="warn">{u.kind === 'in' ? 'A receber' : 'A pagar'}</Pill>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
