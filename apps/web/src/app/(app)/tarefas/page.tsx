import { listTasks, taskCounts, type TaskView } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { Card, Chips, PageHeader, Tabs } from '@/components/ui';
import { TaskRow } from '@/components/task-row';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const ctx = await requirePerm('tasks.view');
  const sp = await searchParams;
  const view = (sp.view ?? 'today') as TaskView;
  const mine = sp.mine !== '0';
  const [tasks, counts] = await Promise.all([listTasks(ctx, { view, mine }), taskCounts(ctx, mine)]);
  const q = (v: string, m = mine) => `?view=${v}&mine=${m ? 1 : 0}`;
  return (
    <div>
      <PageHeader
        eyebrow="Operação"
        title="Tarefas"
        subtitle="Prazos de SLA em dias e horas úteis. Bloqueios pausam o relógio."
        actions={
          ctx.perms.get('tasks.view') !== 'own' && (
            <Chips
              active={mine ? 'mine' : 'all'}
              items={[
                { key: 'mine', label: 'Minhas', href: q(view, true) },
                { key: 'all', label: 'Todas que posso ver', href: q(view, false) },
              ]}
            />
          )
        }
      />
      <div className="mb-4">
        <Tabs
          active={view}
          items={[
            { key: 'today', label: 'Hoje', href: q('today'), count: counts.today },
            { key: 'upcoming', label: 'Próximas', href: q('upcoming'), count: counts.upcoming },
            { key: 'overdue', label: 'Atrasadas', href: q('overdue'), count: counts.overdue },
            { key: 'done', label: 'Concluídas', href: q('done'), count: counts.done },
          ]}
        />
      </div>
      <Card pad={false}>
        {tasks.length ? (
          tasks.map((t) => <TaskRow key={t.id} t={t} />)
        ) : (
          <div className="px-5 py-10 text-center text-muted">Nenhuma tarefa nesta visão.</div>
        )}
      </Card>
    </div>
  );
}
