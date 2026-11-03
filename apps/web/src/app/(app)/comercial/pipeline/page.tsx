import { listLostReasons, pipelineBoard } from '@aos/domain';
import { money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Chips, PageHeader, Stats } from '@/components/ui';
import { Board } from './board';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const ctx = await requirePerm('comercial.view');
  const f = ((await searchParams).f ?? 'all') as 'all' | 'new' | 'upsell';
  const b = await pipelineBoard(ctx, f);
  return (
    <div>
      <PageHeader
        eyebrow="Comercial"
        title="Pipeline"
        subtitle={`${b.totals.openCount} oportunidades abertas · ${money(b.totals.potentialMrrCents)} de MRR potencial`}
      />
      <Stats
        items={[
          {
            label: 'Forecast ponderado',
            value: money(b.totals.forecastCents),
            hint: 'Σ MRR × probabilidade da etapa',
          },
          {
            label: 'Pipeline potencial',
            value: money(b.totals.potentialMrrCents),
            hint: 'previsão, não é receita',
          },
          {
            label: 'Follow-ups vencidos',
            value: b.totals.overdueFollowups.length,
            tone: b.totals.overdueFollowups.length ? 'bad' : 'neutral',
            hint: b.totals.overdueFollowups.map((o) => o.organizationName).join(' · ') || 'em dia',
          },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips
          active={f}
          items={[
            { key: 'all', label: 'Todas', href: '?f=all' },
            { key: 'new', label: 'Novo negócio', href: '?f=new' },
            { key: 'upsell', label: 'Upsell e renovação', href: '?f=upsell' },
          ]}
        />
        <div className="flex gap-2 text-[12px] text-muted">
          <span className="rounded-md border border-dashed border-line px-2.5 py-1">
            Sem resposta {b.parallel.no_response.length}
          </span>
          <span className="rounded-md border border-dashed border-line px-2.5 py-1">
            Pausadas {b.parallel.paused.length}
          </span>
          <span className="rounded-md border border-dashed border-line px-2.5 py-1">
            Perdidas {b.parallel.lost.length}
          </span>
        </div>
      </div>
      <Board
        stages={b.stages
          .filter((s) => !s.isWon)
          .map((s) => ({ id: s.id, name: s.name, probability: s.probability }))}
        cards={b.cards.map((c) => ({
          id: c.id,
          stageId: c.stageId,
          title: c.organizationName,
          type: c.type,
          temperature: c.temperature,
          mrrCents: c.mrrCents,
          setupCents: c.setupCents,
          ownerName: c.ownerName,
          lastInteractionAt: c.lastInteractionAt,
          nextAction: c.nextAction ? { title: c.nextAction.title, dueAt: c.nextAction.dueAt } : null,
        }))}
        reasons={(await listLostReasons(ctx)).map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
