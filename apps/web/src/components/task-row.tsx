'use client';
import Link from 'next/link';
import { api } from '@/lib/trpc';
import { useAction } from './client';
import { Avatar, ClientTag, cx } from './ui';
import { DuePill, SlaPill } from './domain-ui';

export interface TaskLite {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  clientColor: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  originType: string;
  sla: { status: string; dueAt: Date | null; remaining: number } | null;
  block?: { reason: string } | null;
}

const ORIGIN: Record<string, string> = {
  request: 'Solicitação',
  content_change: 'Alteração do cliente',
  manual: 'Tarefa',
  onboarding: 'Onboarding',
};

/** Linha de tarefa com conclusão rápida (checkbox) e desfazer. */
export function TaskRow({ t }: { t: TaskLite }) {
  const { run } = useAction();
  const done = t.status === 'done';
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
      <input
        type="checkbox"
        aria-label="Concluir"
        checked={done}
        disabled={t.status === 'blocked'}
        onChange={() =>
          void run(
            () => api.tasks.setStatus.mutate({ id: t.id, status: done ? 'todo' : 'done' }),
            done ? 'Tarefa reaberta.' : 'Tarefa concluída.',
            {
              undo: done ? undefined : () => api.tasks.setStatus.mutate({ id: t.id, status: 'todo' }),
            },
          )
        }
        className="h-4 w-4 shrink-0 accent-[#1a1a18]"
      />
      <Link href={`/tarefas/${t.id}`} className="min-w-0 flex-1">
        <span className={cx('block truncate font-medium', done && 'text-faint line-through')}>{t.title}</span>
        <span className="flex items-center gap-2 text-[12px] text-muted">
          <ClientTag name={t.clientName} color={t.clientColor} />
          {t.clientName && <span className="text-faint">·</span>}
          {t.block ? (
            <span className="text-bad">Bloqueada: {t.block.reason}</span>
          ) : (
            (ORIGIN[t.originType] ?? 'Tarefa')
          )}
        </span>
      </Link>
      {t.sla ? <SlaPill sla={t.sla} showDue /> : <DuePill dueAt={t.dueAt} done={done} />}
      <Avatar name={t.assigneeName} />
    </div>
  );
}
