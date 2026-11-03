import Link from 'next/link';
import { onboardingBoard } from '@aos/domain';
import { TEAM_FUNCTIONS } from '@aos/domain/labels';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, Empty, PageHeader, Pill } from '@/components/ui';
import { StepCheck } from './step';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const ctx = await requirePerm('clientes.view');
  const obs = await onboardingBoard(ctx);
  const open = obs.filter((o) => !o.o.completedAt);
  const done = obs.filter((o) => o.o.completedAt);
  return (
    <div>
      <PageHeader
        eyebrow="Clientes"
        title="Onboarding"
        subtitle={`${open.length} em andamento · ${done.length} concluídos · 13 etapas por template, prazos em dias úteis`}
      />
      {!open.length && (
        <Empty title="Nenhum onboarding em andamento">
          Ao transformar uma venda em cliente, o onboarding começa aqui.
        </Empty>
      )}
      <div className="space-y-6">
        {open.map((o) => {
          const n = o.steps.filter((s) => s.step.doneAt).length;
          return (
            <Card
              key={o.o.id}
              pad={false}
              title={
                <Link href={`/clientes/${o.client.id}`} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: o.client.color ?? '#a3a19b' }}
                  />
                  {o.client.name}
                </Link>
              }
              action={
                <span className="flex items-center gap-3 text-[12.5px] text-muted">
                  <span className="h-1.5 w-40 rounded bg-line">
                    <span
                      className="block h-1.5 rounded bg-ink"
                      style={{ width: `${(n / o.steps.length) * 100}%` }}
                    />
                  </span>
                  {n}/{o.steps.length}
                </span>
              }
            >
              {o.steps.map(({ step, assignee }) => {
                const late = !step.doneAt && step.dueAt && step.dueAt < new Date();
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0"
                  >
                    <StepCheck id={step.id} done={!!step.doneAt} />
                    <span className="w-6 font-mono text-[11px] text-faint">{step.position}</span>
                    <span className={step.doneAt ? 'flex-1 text-faint line-through' : 'flex-1'}>
                      {step.title}
                    </span>
                    <span className="w-32 text-[12px] text-muted">
                      {TEAM_FUNCTIONS[step.function] ?? step.function}
                    </span>
                    <span className="w-20 text-[12px]">{assignee ?? '—'}</span>
                    {step.doneAt ? (
                      <Pill tone="ok">Feito</Pill>
                    ) : late ? (
                      <Pill tone="bad">Venceu {dateShort(step.dueAt)}</Pill>
                    ) : (
                      <Pill tone="neutral">{dateShort(step.dueAt)}</Pill>
                    )}
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
