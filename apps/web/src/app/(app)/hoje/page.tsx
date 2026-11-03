import Link from 'next/link';
import { todayView } from '@aos/domain';
import { dateLong, dateShort, minutes, money, time } from '@aos/domain/format';
import { requireCtx } from '@/server/session';
import { Card, ClientTag, Empty, Pill, Stats, Tabs } from '@/components/ui';
import { TaskRow } from '@/components/task-row';

export const dynamic = 'force-dynamic';

const greet = () => {
  const h = Number(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }),
  );
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx();
  const v = await todayView(ctx);
  const tab = (await searchParams).tab ?? 'overdue';
  const oldest = v.stats.oldestOverdue
    ? minutes((Date.now() - v.stats.oldestOverdue.getTime()) / 60000)
    : null;
  const list = tab === 'today' ? v.today : tab === 'changes' ? v.changes : v.overdue;

  return (
    <div>
      <div className="mb-6">
        <div className="text-[12.5px] text-muted first-letter:uppercase">{dateLong(new Date())}</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
          {greet()}, {v.name}
        </h1>
        <p className="text-[14px] text-muted">{v.headline}</p>
      </div>
      {v.blocks.tasks && (
        <Stats
          items={[
            {
              label: 'Atrasadas',
              value: v.stats.overdue,
              tone: v.stats.overdue ? 'bad' : 'neutral',
              hint: oldest ? `a mais antiga: ${oldest}` : 'nada atrasado',
            },
            { label: 'Para hoje', value: v.stats.today, hint: 'suas entregas do dia' },
            {
              label: 'Aguardando cliente',
              value: v.stats.waitingClient,
              tone: 'warn',
              hint: `${v.waitingClient.filter((w) => w.late).length} com resposta atrasada`,
            },
            { label: 'Alterações', value: v.stats.changes, tone: 'change', hint: 'com marcações na arte' },
          ]}
        />
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {v.blocks.tasks && (
            <Card
              pad={false}
              title="Minhas prioridades"
              action={
                <Tabs
                  active={tab}
                  items={[
                    { key: 'overdue', label: 'Atrasadas', href: '?tab=overdue', count: v.overdue.length },
                    { key: 'today', label: 'Para hoje', href: '?tab=today', count: v.today.length },
                    { key: 'changes', label: 'Alterações', href: '?tab=changes', count: v.changes.length },
                  ]}
                />
              }
            >
              {list.length ? (
                list.map((t) => <TaskRow key={t.id} t={t} />)
              ) : (
                <div className="px-5 py-8 text-center text-muted">Nada aqui. 👌</div>
              )}
            </Card>
          )}
          {v.blocks.content && (
            <Card
              title="Aguardando cliente"
              pad={false}
              action={
                <Link href="/aprovacoes" className="text-[12.5px] text-muted">
                  Ver tudo
                </Link>
              }
            >
              {v.waitingClient.length ? (
                v.waitingClient.slice(0, 8).map((w) => (
                  <Link
                    key={w.id}
                    href={w.kind === 'content' ? `/conteudos/${w.id}` : `/solicitacoes/${w.id}`}
                    className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-side"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{w.title}</span>
                      <ClientTag name={w.clientName} color={w.clientColor} />
                    </span>
                    {w.late ? (
                      <Pill tone="bad">Resposta atrasada</Pill>
                    ) : (
                      <Pill tone="warn">desde {dateShort(w.since)}</Pill>
                    )}
                  </Link>
                ))
              ) : (
                <div className="px-5 py-6 text-center text-muted">Nada parado no cliente.</div>
              )}
            </Card>
          )}
          {!v.blocks.tasks && !v.blocks.content && (
            <Empty title="Sem blocos para o seu perfil">Peça ao Admin as permissões necessárias.</Empty>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Reuniões de hoje" pad={false}>
            {v.meetings.length ? (
              v.meetings.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0"
                >
                  <span className="num w-12 font-mono text-[13px]">{time(m.startsAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.title}</span>
                    <span className="text-[12px] text-muted">
                      {m.location ?? '—'} · {m.participants.map((p) => p.name).join(' e ')}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-center text-muted">Sem reuniões hoje.</div>
            )}
          </Card>
          {v.blocks.comercial && (
            <Card
              title="Comercial"
              pad={false}
              action={
                <Link href="/comercial/pipeline" className="text-[12.5px] text-muted">
                  Ver tudo
                </Link>
              }
            >
              {v.followups.length ? (
                v.followups.map((f) => (
                  <Link
                    key={f.a.id}
                    href={`/comercial/oportunidades/${f.oppId}`}
                    className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-side"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.org}</span>
                      <span className="block truncate text-[12px] text-muted">{f.a.title}</span>
                    </span>
                    {f.a.dueAt < new Date() ? (
                      <Pill tone="bad">Vencido {time(f.a.dueAt)}</Pill>
                    ) : (
                      <Pill tone="warn">Hoje {time(f.a.dueAt)}</Pill>
                    )}
                  </Link>
                ))
              ) : (
                <div className="px-5 py-6 text-center text-muted">Nenhum follow-up para hoje.</div>
              )}
            </Card>
          )}
          {v.finance && (
            <Card
              title="Alertas financeiros"
              pad={false}
              action={
                <Link href="/financeiro/receber" className="text-[12.5px] text-muted">
                  Ver tudo
                </Link>
              }
            >
              {v.finance.pendingContracts.map((c) => (
                <Link
                  key={c.c.id}
                  href="/financeiro/contratos"
                  className="flex items-center gap-3 border-b border-line px-5 py-3 hover:bg-side"
                >
                  <span className="flex-1">
                    <span className="block font-medium">{c.client}</span>
                    <span className="text-[12px] text-muted">
                      Contrato {c.c.number} aguardando confirmação
                    </span>
                  </span>
                  <Pill tone="info">Confirmar</Pill>
                </Link>
              ))}
              {v.finance.overdue.map((i) => (
                <div key={i.i.id} className="flex items-center gap-3 border-b border-line px-5 py-3">
                  <span className="flex-1">
                    <span className="block font-medium">{i.client}</span>
                    <span className="text-[12px] text-muted">{i.i.description}</span>
                  </span>
                  <span className="num font-medium">{money(i.i.amountCents - i.i.paidCents)}</span>
                  <Pill tone="bad">Venceu {dateShort(i.i.dueOn)}</Pill>
                </div>
              ))}
              {v.finance.dueSoon.map((i) => (
                <div
                  key={i.i.id}
                  className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0"
                >
                  <span className="flex-1">
                    <span className="block font-medium">{i.client}</span>
                    <span className="text-[12px] text-muted">{i.i.description}</span>
                  </span>
                  <span className="num font-medium">{money(i.i.amountCents - i.i.paidCents)}</span>
                  <Pill tone="warn">Vence {dateShort(i.i.dueOn)}</Pill>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
