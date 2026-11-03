import { listContents, listMeetings, listTasks } from '@aos/domain';
import { time } from '@aos/domain/format';
import { requireCtx } from '@/server/session';
import { PageHeader } from '@/components/ui';
import { MonthCalendar } from '@/components/content-views';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireCtx();
  const month = (await searchParams).m ?? new Date().toISOString().slice(0, 7);
  const [y, mo] = month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(y, mo - 1, 1) - 7 * 86_400_000);
  const to = new Date(Date.UTC(y, mo, 1) + 7 * 86_400_000);
  const [contents, meetings, tasks] = await Promise.all([
    ctx.perms.has('conteudo.view') ? listContents(ctx, { from, to }) : [],
    listMeetings(ctx, from, to),
    ctx.perms.has('tasks.view') ? listTasks(ctx, { view: 'all', mine: true }) : [],
  ]);
  const shift = (n: number) => new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
  return (
    <div>
      <PageHeader
        eyebrow="Operação"
        title="Calendário"
        subtitle="Publicações, reuniões e seus prazos (janela visível do mês)."
      />
      <div className="mb-3 flex items-center gap-3">
        <a href={`?m=${shift(-1)}`} className="rounded-md border border-line px-2 py-1">
          ←
        </a>
        <span className="font-semibold capitalize">
          {new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </span>
        <a href={`?m=${shift(1)}`} className="rounded-md border border-line px-2 py-1">
          →
        </a>
        <span className="ml-4 flex gap-3 text-[12px] text-muted">
          <span>■ conteúdo</span>
          <span className="text-info">■ reunião</span>
          <span className="text-warn">■ prazo de tarefa</span>
        </span>
      </div>
      <MonthCalendar
        month={month}
        items={contents}
        extra={[
          ...meetings.map((m) => ({
            id: m.id,
            date: m.startsAt,
            label: `${time(m.startsAt)} ${m.title}`,
            tone: 'info' as const,
          })),
          ...tasks
            .filter((t) => t.dueAt && t.status !== 'done' && t.status !== 'cancelled')
            .map((t) => ({
              id: t.id,
              date: t.dueAt!,
              label: `⏱ ${t.title}`,
              href: `/tarefas/${t.id}`,
              tone: (t.overdue ? 'bad' : 'warn') as 'bad',
            })),
        ]}
      />
    </div>
  );
}
