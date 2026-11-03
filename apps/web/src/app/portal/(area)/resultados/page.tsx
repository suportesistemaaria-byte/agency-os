import { portalResults } from '@aos/domain';
import { METRICS } from '@aos/domain/labels';
import { requirePortal } from '@/server/session';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export default async function PortalResults() {
  const p = await requirePortal();
  const r = await portalResults(p);
  const cur = r.monthly[r.period] ?? {};
  const prevKey = r.months[r.months.length - 2]!;
  const prev = r.monthly[prevKey] ?? {};
  const keys = ['reach', 'engagement', 'followers', 'leads'];
  const has = r.months.some((m) => Object.values(r.monthly[m] ?? {}).some((v) => v > 0));
  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold">Resultados</h1>
      {!has && (
        <p className="text-muted">
          Os resultados aparecem aqui assim que a agência registrar as métricas do período.
        </p>
      )}
      {has && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {keys.map((k) => {
              const v = cur[k] ?? 0;
              const d = prev[k] ? (v - prev[k]!) / prev[k]! : null;
              return (
                <div key={k} className="rounded-xl border border-line p-3">
                  <div className="text-[12px] text-muted">
                    {k === 'engagement' ? 'Engajamento' : METRICS[k]!.label}
                  </div>
                  <div className="num text-[20px] font-semibold">{fmt(v)}</div>
                  {d !== null && (
                    <div className={`text-[11.5px] ${d >= 0 ? 'text-ok' : 'text-bad'}`}>
                      {d >= 0 ? '+' : ''}
                      {Math.round(d * 100)}% vs. mês anterior
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <section>
            <h2 className="mb-2 font-semibold">Alcance nos últimos 6 meses</h2>
            <div className="flex h-32 items-end gap-2 border-b border-line">
              {r.months.map((m) => {
                const v = r.monthly[m]?.reach ?? 0;
                const max = Math.max(1, ...r.months.map((x) => r.monthly[x]?.reach ?? 0));
                return (
                  <div
                    key={m}
                    className="flex-1 rounded-t bg-ink"
                    style={{ height: `${(v / max) * 100}%` }}
                    title={`${m}: ${fmt(v)}`}
                  />
                );
              })}
            </div>
          </section>
          {r.goals.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Metas do mês</h2>
              {r.goals.map((g) => (
                <div key={g.id} className="py-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span>{g.metric === 'engagement' ? 'Engajamento' : METRICS[g.metric]?.label}</span>
                    <span className="num text-muted">
                      {fmt(g.actual)} / {fmt(g.target)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-line">
                    <div
                      className="h-1.5 rounded bg-ok"
                      style={{ width: `${Math.min(100, (g.actual / g.target) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
