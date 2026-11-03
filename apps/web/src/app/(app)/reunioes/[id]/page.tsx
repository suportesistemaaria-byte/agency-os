import Link from 'next/link';
import { getMeeting, memberOptions } from '@aos/domain';
import { TASK_STATUS_LABEL } from '@aos/domain/labels';
import { dateTime } from '@aos/domain/format';
import { guard, requireCtx } from '@/server/session';
import { Card, Meta, PageHeader, Pill } from '@/components/ui';
import { DecisionForm, NotesEditor } from './actions';

export const dynamic = 'force-dynamic';

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const d = await guard(getMeeting(ctx, (await params).id));
  const members = await memberOptions(ctx);
  const m = d.meeting;
  return (
    <div>
      <PageHeader
        eyebrow="Reunião"
        title={m.title}
        subtitle={`${dateTime(m.startsAt)} · ${m.location ?? 'sem local'}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Ata">
            <NotesEditor id={m.id} notes={m.notes ?? ''} />
          </Card>
          <Card title={`Decisões (${d.decisions.length})`} pad={false}>
            {d.decisions.map(({ d: dec, owner, taskStatus }) => (
              <div key={dec.id} className="flex items-center gap-3 border-b border-line px-5 py-3">
                <span className="flex-1">
                  {dec.description}
                  <span className="block text-[12px] text-muted">Responsável: {owner ?? '—'}</span>
                </span>
                {dec.taskId && (
                  <Link href={`/tarefas/${dec.taskId}`}>
                    <Pill tone={taskStatus === 'done' ? 'ok' : 'info'}>
                      Tarefa · {TASK_STATUS_LABEL[taskStatus as 'todo'] ?? '—'}
                    </Pill>
                  </Link>
                )}
              </div>
            ))}
            {ctx.perms.has('tasks.edit') && <DecisionForm meetingId={m.id} members={members} />}
          </Card>
        </div>
        <Card title="Detalhes">
          <Meta
            rows={[
              [
                'Cliente',
                d.client ? (
                  <Link key="c" href={`/clientes/${d.client.id}`}>
                    {d.client.name}
                  </Link>
                ) : (
                  '—'
                ),
              ],
              ['Participantes', d.participants.map((p) => p.name).join(', ') || '—'],
              ['Criada em', dateTime(m.createdAt)],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
