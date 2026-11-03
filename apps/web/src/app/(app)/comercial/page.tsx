import Link from 'next/link';
import { commercialDashboard } from '@aos/domain';
import { money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, PageHeader, Stats, LinkButton } from '@/components/ui';

export const dynamic = 'force-dynamic';

const PROP: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronta',
  sent: 'Enviada',
  viewed: 'Visualizada',
  negotiation: 'Negociação',
  accepted: 'Aceita',
  refused: 'Recusada',
  expired: 'Expirada',
};

export default async function CommercialDashboard() {
  const ctx = await requirePerm('comercial.view');
  const d = await commercialDashboard(ctx);
  const pct = d.goalCents ? Math.round((d.soldCents / d.goalCents) * 100) : 0;
  const maxStage = Math.max(1, ...d.stages.map((s) => s.mrrCents));
  return (
    <div>
      <PageHeader
        eyebrow="Comercial"
        title="Dashboard comercial"
        subtitle={`${d.totals.openCount} oportunidades abertas`}
        actions={
          <LinkButton href="/comercial/pipeline" variant="primary">
            Abrir pipeline
          </LinkButton>
        }
      />
      <Stats
        items={[
          {
            label: 'Pipeline potencial',
            value: money(d.totals.potentialMrrCents),
            hint: 'Σ MRR das abertas · não é receita',
          },
          {
            label: 'Forecast ponderado',
            value: money(d.totals.forecastCents),
            hint: 'Σ MRR × probabilidade da etapa',
          },
          {
            label: 'MRR vendido no mês',
            value: money(d.soldCents),
            tone: 'ok',
            hint: d.goalCents ? `${pct}% da meta de ${money(d.goalCents)}` : 'sem meta cadastrada',
          },
          {
            label: 'Follow-ups vencidos',
            value: d.totals.overdueFollowups.length,
            tone: d.totals.overdueFollowups.length ? 'bad' : 'neutral',
            hint: d.totals.overdueFollowups.map((o) => o.organizationName).join(' · ') || 'em dia',
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card title="Funil por etapa">
          <div className="space-y-3">
            {d.stages
              .filter((s) => !s.isWon)
              .map((s) => (
                <div key={s.id} className="grid grid-cols-[120px_1fr_120px] items-center gap-3">
                  <span className="text-muted">{s.name}</span>
                  <div className="h-2 rounded bg-[#f1f0ec]">
                    <div
                      className="h-2 rounded bg-ink"
                      style={{ width: `${(s.mrrCents / maxStage) * 100}%` }}
                    />
                  </div>
                  <span className="num text-right">
                    {money(s.mrrCents)} <span className="text-faint">· {s.count}</span>
                  </span>
                </div>
              ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Propostas" pad={false}>
            {d.proposalsByStatus.map((p) => (
              <div
                key={p.status}
                className="flex justify-between border-b border-line px-5 py-2.5 last:border-0"
              >
                <span>{PROP[p.status] ?? p.status}</span>
                <span className="num font-medium">{p.n}</span>
              </div>
            ))}
          </Card>
          <Card title="Perdas por motivo" pad={false}>
            {d.lostByReason.length ? (
              d.lostByReason.map((l) => (
                <div
                  key={l.reason}
                  className="flex justify-between border-b border-line px-5 py-2.5 last:border-0"
                >
                  <span>{l.reason}</span>
                  <span className="num font-medium">{l.n}</span>
                </div>
              ))
            ) : (
              <div className="px-5 py-4 text-muted">Nenhuma perda registrada.</div>
            )}
          </Card>
          <Card title="Estados paralelos" pad={false}>
            {(
              [
                ['Sem resposta', d.parallel.no_response],
                ['Pausadas', d.parallel.paused],
                ['Perdidas', d.parallel.lost],
              ] as const
            ).map(([l, list]) => (
              <div key={l} className="flex justify-between border-b border-line px-5 py-2.5 last:border-0">
                <span>{l}</span>
                <span className="num font-medium">{list.length}</span>
              </div>
            ))}
            <Link href="/comercial/leads" className="block px-5 py-2.5 text-[12.5px] text-muted">
              Ver leads
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
