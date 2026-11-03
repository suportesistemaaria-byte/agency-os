import { METRICS } from '@aos/domain/labels';
import { Card, Empty, Pill, Stats, cx } from './ui';

const fmt = (n: number) =>
  n >= 10000
    ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

type Overview = {
  period: string;
  months: string[];
  monthly: Record<string, Record<string, number>>;
  kpis: { metric: string; label: string; value: number; previous: number; delta: number | null }[];
  top: {
    contentId: string | null;
    title: string;
    clientName: string;
    format: string;
    engagement: number;
    reach: number;
    rate: number | null;
  }[];
  goals: { id: string; metric: string; target: number; actual: number; progress: number }[];
  hasData: boolean;
};

/** Visão de performance compartilhada: módulo Inteligência e aba Performance do cliente. */
export function PerformanceView({ o, showClient }: { o: Overview; showClient: boolean }) {
  if (!o.hasData)
    return (
      <Empty title="Sem métricas no período">
        Registre manualmente ou importe um CSV (data; metrica; valor; conteudo).
      </Empty>
    );
  const series = (k: string) => o.months.map((m) => o.monthly[m]?.[k] ?? 0);
  const label = (k: string) => (k === 'engagement' ? 'Engajamento' : (METRICS[k]?.label ?? k));
  return (
    <div className="space-y-6">
      <Stats
        items={o.kpis.map((k) => ({
          label: k.label,
          value: fmt(k.value),
          tone: k.delta === null ? 'neutral' : k.delta >= 0 ? 'ok' : 'bad',
          hint:
            k.delta === null
              ? 'sem mês anterior'
              : `${k.delta >= 0 ? '+' : ''}${Math.round(k.delta * 100)}% vs. mês anterior`,
        }))}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        {(['reach', 'engagement', 'followers', 'leads'] as const).map((k) => {
          const vals = series(k);
          const max = Math.max(1, ...vals);
          return (
            <Card key={k} title={`Evolução · ${label(k)}`}>
              <div className="flex h-36 items-end gap-3 border-b border-line">
                {vals.map((v, i) => (
                  <div
                    key={o.months[i]}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                    title={`${o.months[i]}: ${fmt(v)}`}
                  >
                    <span className="num mb-1 text-[11px] text-muted">{v ? fmt(v) : ''}</span>
                    <div
                      className={cx(
                        'w-full max-w-10 rounded-t',
                        i === vals.length - 1 ? 'bg-ink' : 'bg-[#d9d7d0]',
                      )}
                      style={{ height: `${(v / max) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1.5 font-mono text-[11px] text-faint uppercase">
                {o.months.map((m) => (
                  <span key={m} className="flex-1 text-center">
                    {new Date(`${m}-15T12:00:00Z`)
                      .toLocaleDateString('pt-BR', { month: 'short' })
                      .replace('.', '')}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Melhores conteúdos (últimos 3 meses)" pad={false}>
          {o.top.length ? (
            o.top.map((t, i) => (
              <div
                key={t.contentId ?? i}
                className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0"
              >
                <span className="w-5 font-mono text-[12px] text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.title}</span>
                  {showClient && (
                    <span className="text-[12px] text-muted">
                      {t.clientName} · {t.format}
                    </span>
                  )}
                </span>
                <span className="num text-right">
                  <span className="block font-medium">{fmt(t.engagement)}</span>
                  <span className="text-[11px] text-faint">
                    {t.rate !== null ? `${(t.rate * 100).toFixed(1)}% do alcance` : 'engajamento'}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-4 text-muted">Sem métricas por conteúdo.</div>
          )}
        </Card>
        {o.goals.length > 0 && (
          <Card title={`Metas de ${o.period}`}>
            {o.goals.map((g) => (
              <div key={g.id} className="py-2">
                <div className="flex justify-between">
                  <span>{label(g.metric)}</span>
                  <span className="num text-muted">
                    {fmt(g.actual)} / {fmt(g.target)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-line">
                  <div
                    className={cx('h-1.5 rounded', g.progress >= 1 ? 'bg-ok' : 'bg-ink')}
                    style={{ width: `${Math.min(100, g.progress * 100)}%` }}
                  />
                </div>
                {g.progress >= 1 && (
                  <Pill tone="ok" className="mt-1">
                    Meta batida
                  </Pill>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
