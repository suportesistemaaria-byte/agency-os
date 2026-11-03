import { listClientsBasic, performanceOverview } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { Card, Chips, PageHeader, Pill } from '@/components/ui';
import { PerformanceView } from '@/components/performance-view';
import { LearningForm, LearningStatus, MetricsEntry } from './actions';

export const dynamic = 'force-dynamic';

const CONF: Record<string, string> = { low: 'baixa', medium: 'média', high: 'alta' };
const STATUS: Record<string, [string, 'neutral' | 'ok' | 'bad']> = {
  hypothesis: ['Hipótese', 'neutral'],
  validated: ['Validado', 'ok'],
  discarded: ['Descartado', 'bad'],
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; p?: string }>;
}) {
  const ctx = await requirePerm('reports.view');
  const sp = await searchParams;
  const clients = await listClientsBasic(ctx);
  const clientId = sp.c && clients.some((c) => c.id === sp.c) ? sp.c : undefined;
  const o = await performanceOverview(ctx, { clientId, period: sp.p });
  return (
    <div>
      <PageHeader
        eyebrow="Inteligência"
        title="Performance"
        subtitle="Métricas manuais e por CSV, melhores conteúdos, evolução, metas e aprendizados."
        actions={clientId && <MetricsEntry clientId={clientId} period={o.period} />}
      />
      <div className="mb-5">
        <Chips
          active={clientId ?? 'all'}
          items={[
            { key: 'all', label: 'Todos os clientes', href: '?' },
            ...clients.map((c) => ({ key: c.id, label: c.name, href: `?c=${c.id}` })),
          ]}
        />
      </div>
      {!clientId && (
        <p className="mb-4 text-[12.5px] text-muted">
          Escolha um cliente para registrar métricas, importar CSV e definir metas.
        </p>
      )}
      <PerformanceView o={o} showClient={!clientId} />
      <div className="mt-6">
        <Card title="Aprendizados" action={<LearningForm clientId={clientId ?? null} />} pad={false}>
          {o.learnings.length ? (
            o.learnings.map(({ l, client }) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.title}</span>
                  <span className="text-[12px] text-muted">
                    {[client, l.evidence, `confiança ${CONF[l.confidence]}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Pill tone={STATUS[l.status]![1]}>{STATUS[l.status]![0]}</Pill>
                <LearningStatus id={l.id} status={l.status} />
              </div>
            ))
          ) : (
            <div className="px-5 py-4 text-muted">Nenhum aprendizado registrado.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
