import Link from 'next/link';
import { executiveDashboard } from '@aos/domain';
import { money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, PageHeader, Stats } from '@/components/ui';
import { HealthBar } from '../clientes/health';

export const dynamic = 'force-dynamic';

export default async function ExecutivePage() {
  const ctx = await requirePerm('reports.view');
  const d = await executiveDashboard(ctx);
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Painel executivo"
        subtitle="Saúde da carteira, entrega no prazo, comercial e caixa — só o que o seu perfil pode ver."
      />
      <Stats
        items={[
          ...(d.finance
            ? [
                { label: 'MRR', value: money(d.finance.mrrCents), tone: 'ok' as const },
                {
                  label: 'Inadimplência',
                  value: money(d.finance.overdueCents),
                  tone: d.finance.overdueCents ? ('bad' as const) : ('neutral' as const),
                },
              ]
            : []),
          {
            label: 'SLA cumprido (30 dias)',
            value: pct(d.sla.compliance),
            hint: `${d.sla.met} no prazo · ${d.sla.missed} com atraso`,
            tone: (d.sla.compliance ?? 1) < 0.85 ? 'warn' : 'ok',
          },
          {
            label: 'Aprovação de primeira',
            value: pct(d.sla.firstPassRate),
            hint: 'aprovações ÷ envios ao cliente',
          },
          ...(d.commercial
            ? [
                {
                  label: 'Forecast',
                  value: money(d.commercial.forecastCents),
                  hint: `${d.commercial.open} abertas · ${d.commercial.overdueFollowups} follow-ups vencidos`,
                },
              ]
            : []),
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Carteira por saúde">
          {(
            [
              ['Saudáveis', d.clients.bands.healthy, 'bg-ok'],
              ['Em atenção', d.clients.bands.attention, 'bg-warn'],
              ['Críticos', d.clients.bands.critical, 'bg-bad'],
              ['Onboarding', d.clients.bands.onboarding, 'bg-info'],
            ] as const
          ).map(([l, n, c]) => (
            <div key={l} className="flex items-center gap-3 py-1.5">
              <span className="w-24 text-muted">{l}</span>
              <span className="h-2 flex-1 rounded bg-line">
                <span
                  className={`block h-2 rounded ${c}`}
                  style={{ width: `${(n / Math.max(1, d.clients.total)) * 100}%` }}
                />
              </span>
              <span className="num w-6 text-right">{n}</span>
            </div>
          ))}
        </Card>
        <Card title="Clientes em risco" pad={false}>
          {d.clients.risks.length ? (
            d.clients.risks.map((c) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="block border-b border-line px-5 py-3 last:border-0 hover:bg-side"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="w-28">
                    <HealthBar score={c.health.score} />
                  </span>
                </div>
                <div className="text-[12px] text-muted">
                  {c.health.factors.map((f) => f.label).join(' · ')}
                </div>
              </Link>
            ))
          ) : (
            <div className="px-5 py-4 text-muted">Nenhum cliente em risco.</div>
          )}
        </Card>
        <Card title="Relógios de SLA abertos">
          {Object.entries({
            on_time: 'No prazo',
            near_due: 'Próximo',
            overdue: 'Atrasado',
            paused: 'Pausado',
            blocked: 'Bloqueado',
          }).map(([k, l]) => (
            <div key={k} className="flex justify-between py-1.5">
              <span className="text-muted">{l}</span>
              <span className="num font-medium">{d.sla.open[k] ?? 0}</span>
            </div>
          ))}
        </Card>
      </div>
      {d.finance && (
        <div className="mt-6">
          <Card title="Recebido × despesas (6 meses)">
            <div className="grid grid-cols-6 gap-3 text-center">
              {d.finance.series.map((x) => (
                <div key={x.period}>
                  <div className="font-mono text-[11px] text-faint">{x.period}</div>
                  <div className="num text-ok">{money(x.receivedCents)}</div>
                  <div className="num text-muted">{money(x.expensesCents)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
