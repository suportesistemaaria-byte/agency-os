import Link from 'next/link';
import { getRequestDetail, memberOptions } from '@aos/domain';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, REQUEST_FLOW } from '@aos/domain/labels';
import { dateTime } from '@aos/domain/format';
import { requirePerm, guard } from '@/server/session';
import { Card, ClientTag, Meta, cx } from '@/components/ui';
import { RequestStatusPill, SlaPill } from '@/components/domain-ui';
import { RequestActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePerm('requests.view');
  const d = await guard(getRequestDetail(ctx, (await params).id));
  const r = d.request;
  const members = await memberOptions(ctx);
  const idx = REQUEST_FLOW.indexOf(r.status);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div>
          <ClientTag name={d.client.name} color={d.client.color} />
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{r.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <RequestStatusPill status={r.status} />
            <SlaPill sla={d.sla} />
          </div>
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${REQUEST_FLOW.length}, 1fr)` }}>
          {REQUEST_FLOW.map((s, i) => (
            <div key={s}>
              <div className={cx('h-[3px] rounded', i <= idx ? 'bg-ink' : 'bg-line')} />
              <div className={cx('mt-1.5 text-[11.5px]', i === idx ? 'font-semibold' : 'text-muted')}>
                {REQUEST_STATUS_LABEL[s]}
              </div>
            </div>
          ))}
        </div>
        {ctx.perms.has('requests.edit') && <RequestActions id={r.id} status={r.status} members={members} />}
        {r.description && (
          <Card title="Descrição">
            <p className="whitespace-pre-wrap">{r.description}</p>
          </Card>
        )}
        <Card title="Tarefas ligadas" pad={false}>
          {d.tasks.length ? (
            d.tasks.map((t) => (
              <Link
                key={t.id}
                href={`/tarefas/${t.id}`}
                className="block border-b border-line px-5 py-3 last:border-0 hover:bg-side"
              >
                {t.title}
              </Link>
            ))
          ) : (
            <div className="px-5 py-3 text-muted">A tarefa de produção é criada na triagem.</div>
          )}
        </Card>
        <Card title="Histórico de status" pad={false}>
          {d.history.map(({ h, actor }) => (
            <div key={h.id} className="flex justify-between border-b border-line px-5 py-2.5 last:border-0">
              <span>
                {h.fromStatus ? `${REQUEST_STATUS_LABEL[h.fromStatus]} → ` : ''}
                <b>{REQUEST_STATUS_LABEL[h.toStatus]}</b>
                {actor ? ` · ${actor}` : ''}
              </span>
              <span className="text-[12px] text-faint">{dateTime(h.createdAt)}</span>
            </div>
          ))}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Detalhes">
          <Meta
            rows={[
              ['Tipo', REQUEST_TYPE_LABEL[r.type]],
              ['Origem', r.origin],
              ['Escopo', r.inScope ? 'Dentro do escopo' : 'Fora do escopo'],
              ['Urgência', r.urgent ? 'Urgente' : 'Normal'],
              ['Responsável', d.assigneeName ?? '—'],
              ['Recebida', dateTime(r.createdAt)],
              ['Entregue', r.deliveredAt ? dateTime(r.deliveredAt) : '—'],
            ]}
          />
        </Card>
        <Card title="Relógios de SLA" pad={false}>
          {d.clocks.map((c) => (
            <div key={c.id} className="border-b border-line px-5 py-3 text-[12.5px] last:border-0">
              <div className="flex justify-between">
                <span className="font-medium">{c.policyKey}</span>
                <span className="font-mono text-[11px] text-faint">{c.status}</span>
              </div>
              <div className="text-muted">
                Início {dateTime(c.startAt)} · vence {c.dueAt ? dateTime(c.dueAt) : '— (pausado)'}
              </div>
              {d.intervals
                .filter((i) => i.clockId === c.id)
                .map((i) => (
                  <div key={i.id} className="text-faint">
                    Pausa ({i.kind === 'client' ? 'cliente' : 'bloqueio'}): {dateTime(i.startedAt)} →{' '}
                    {i.endedAt ? dateTime(i.endedAt) : 'em aberto'}
                  </div>
                ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
