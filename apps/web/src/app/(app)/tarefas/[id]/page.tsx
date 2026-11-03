import Link from 'next/link';
import { getTaskDetail, memberOptions } from '@aos/domain';
import { PRIORITY_LABEL } from '@aos/domain/labels';
import { dateTime } from '@aos/domain/format';
import { requirePerm, guard } from '@/server/session';
import { Avatar, Card, ClientTag, Meta, Pill } from '@/components/ui';
import { DuePill, SlaPill, TaskStatusPill } from '@/components/domain-ui';
import { UploadFiles } from '../../clientes/[id]/client-actions';
import { BlockBox, CommentBox, TaskActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePerm('tasks.view');
  const d = await guard(getTaskDetail(ctx, (await params).id));
  const t = d.task;
  const members = await memberOptions(ctx);
  const assignee = members.find((m) => m.id === t.assigneeId)?.name ?? null;
  const openBlock = d.blocks.find((b) => !b.endedAt);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div>
          <ClientTag name={d.client?.name} color={d.client?.color} />
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{t.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TaskStatusPill status={t.status} />
            {d.sla ? <SlaPill sla={d.sla} /> : <DuePill dueAt={t.dueAt} done={t.status === 'done'} />}
            {t.requestId && (
              <Link href={`/solicitacoes/${t.requestId}`} className="text-[12.5px] text-muted">
                Solicitação de origem →
              </Link>
            )}
            {t.contentId && (
              <Link href={`/conteudos/${t.contentId}`} className="text-[12.5px] text-muted">
                Conteúdo de origem →
              </Link>
            )}
          </div>
        </div>
        {d.canEdit && (
          <TaskActions
            id={t.id}
            status={t.status}
            assigneeId={t.assigneeId}
            members={members}
            clockId={t.slaClockId}
            canOverride={ctx.perms.has('sla.override')}
          />
        )}
        {(openBlock || (d.canEdit && t.status !== 'done')) && (
          <BlockBox
            id={t.id}
            block={
              openBlock
                ? {
                    reason: openBlock.reason,
                    resolver: openBlock.resolver,
                    startedAt: openBlock.startedAt,
                    note: openBlock.note,
                  }
                : null
            }
            canEdit={d.canEdit}
            members={members}
          />
        )}
        {t.description && (
          <Card title="Descrição">
            <p className="whitespace-pre-wrap">{t.description}</p>
          </Card>
        )}
        <Card title="Comentários" pad={false}>
          {d.comments.map(({ c, author }) => (
            <div key={c.id} className="flex gap-3 border-b border-line px-5 py-3">
              <Avatar name={author} />
              <div>
                <div className="text-[12px] text-muted">
                  {author} · {dateTime(c.createdAt)}
                </div>
                <div>{c.body}</div>
              </div>
            </div>
          ))}
          <CommentBox id={t.id} />
        </Card>
        <Card
          title="Arquivos"
          action={
            d.canEdit && (
              <UploadFiles clientId={t.clientId ?? undefined} entity={{ type: 'task', id: t.id }} />
            )
          }
        >
          {d.files.length ? (
            d.files.map((f) => (
              <a key={f.id} href={`/api/files/${f.id}`} target="_blank" className="block py-1">
                {f.name}
              </a>
            ))
          ) : (
            <span className="text-muted">Nenhum arquivo.</span>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Detalhes">
          <Meta
            rows={[
              [
                'Responsável',
                assignee ? (
                  <span key="a" className="inline-flex items-center gap-1.5">
                    <Avatar name={assignee} />
                    {assignee}
                  </span>
                ) : (
                  '—'
                ),
              ],
              ['Participantes', d.participants.map((p) => p.name).join(', ') || '—'],
              [
                'Prioridade',
                <Pill
                  key="p"
                  tone={t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : 'neutral'}
                >
                  {PRIORITY_LABEL[t.priority]}
                </Pill>,
              ],
              ['Prazo', dateTime(t.dueAt)],
              ['Política de SLA', d.sla?.policyKey ?? 'prazo manual'],
              [
                'Dependências',
                d.dependencies.length
                  ? d.dependencies
                      .map((x) => `${x.title} (${x.status === 'done' ? 'feita' : 'aberta'})`)
                      .join(', ')
                  : '—',
              ],
              ['Criada em', dateTime(t.createdAt)],
            ]}
          />
        </Card>
        <Card title="Bloqueios" pad={false}>
          {d.blocks.length ? (
            d.blocks.map((b) => (
              <div key={b.id} className="border-b border-line px-5 py-2.5 text-[12.5px] last:border-0">
                <div className="font-medium">{b.reason}</div>
                <div className="text-muted">
                  Resolve: {b.resolver} · {dateTime(b.startedAt)} →{' '}
                  {b.endedAt ? dateTime(b.endedAt) : 'em aberto'}
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-3 text-muted">Nunca bloqueada.</div>
          )}
        </Card>
        <Card title="Histórico" pad={false}>
          {d.history.map((h) => (
            <div
              key={h.id}
              className="flex justify-between border-b border-line px-5 py-2 text-[12px] last:border-0"
            >
              <span className="font-mono">{h.action}</span>
              <span className="text-faint">{dateTime(h.createdAt)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
