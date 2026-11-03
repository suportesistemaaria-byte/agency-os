import Link from 'next/link';
import { getOpportunity, memberOptions } from '@aos/domain';
import { ACTIVITY_LABEL } from '@aos/domain/labels';
import { dateFull, dateShort, dateTime, money } from '@aos/domain/format';
import { requirePerm, guard } from '@/server/session';
import { Card, Meta, Pill, cx } from '@/components/ui';
import { PROPOSAL_STATUS, TempPill } from '@/components/domain-ui';
import {
  ActivityBox,
  NextActionBox,
  OppHeaderActions,
  ProposalActions,
  NewProposal,
  ConvertButton,
  AmendButton,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requirePerm('comercial.view');
  const { id } = await params;
  const tab = (await searchParams).tab ?? 'timeline';
  const o = await guard(getOpportunity(ctx, id));
  const members = await memberOptions(ctx);
  const op = o.opportunity;
  const stageIdx = o.stages.findIndex((s) => s.id === op.stageId);
  const prob = o.stages[stageIdx]?.probability ?? 0;
  const next = o.nextActions.find((n) => !n.doneAt) ?? null;
  const canEdit = ctx.perms.has('comercial.edit');
  const STATE: Record<string, [string, 'neutral' | 'bad' | 'ok']> = {
    no_response: ['Sem resposta', 'neutral'],
    paused: ['Pausada', 'neutral'],
    lost: ['Perdida', 'bad'],
    won: ['Ganha', 'ok'],
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{o.organization.name}</h1>
            <Pill tone="neutral" dot={false}>
              {op.type === 'new' ? 'Novo negócio' : op.type === 'upsell' ? 'Upsell' : 'Renovação'}
            </Pill>
            <TempPill t={op.temperature} />
            {STATE[op.state] && <Pill tone={STATE[op.state]![1]}>{STATE[op.state]![0]}</Pill>}
          </div>
          <div className="mt-1 text-[14px] text-muted">
            {[
              op.service,
              o.person ? `${o.person.name}${o.person.roleTitle ? ` · ${o.person.roleTitle}` : ''}` : null,
              o.ownerName ? `responsável ${o.ownerName}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {op.state === 'won' && !op.convertedClientId && op.type === 'new' && (
              <ConvertButton opportunityId={op.id} members={members} />
            )}
            {op.state === 'won' && !op.convertedClientId && op.type !== 'new' && (
              <AmendButton opportunityId={op.id} />
            )}
            {op.convertedClientId && (
              <Link
                href={`/clientes/${op.convertedClientId}`}
                className="rounded-lg border border-line px-3.5 py-2 font-medium"
              >
                Ver cliente →
              </Link>
            )}
            <OppHeaderActions
              id={op.id}
              state={op.state}
              reasons={o.lostReasons.map((r) => ({ id: r.id, name: r.name }))}
            />
          </div>
        )}
      </div>
      <div className="mb-6 grid gap-1" style={{ gridTemplateColumns: `repeat(${o.stages.length}, 1fr)` }}>
        {o.stages.map((s, i) => (
          <div key={s.id}>
            <div className={cx('h-[3px] rounded', i <= stageIdx ? 'bg-ink' : 'bg-line')} />
            <div className={cx('mt-1.5 text-[11.5px]', i === stageIdx ? 'font-semibold' : 'text-muted')}>
              {s.name}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_430px]">
        <div className="space-y-6">
          {op.state === 'open' && (
            <NextActionBox
              action={next ? { id: next.id, title: next.title, dueAt: next.dueAt } : null}
              opportunityId={op.id}
              canEdit={canEdit}
            />
          )}
          <Card pad={false}>
            {canEdit && <ActivityBox opportunityId={op.id} />}
            <div className="flex gap-5 border-b border-line px-5">
              {[
                ['timeline', `Timeline`, o.activities.length],
                ['propostas', 'Propostas', o.proposals.length],
                ['reunioes', 'Reuniões', o.meetings.length],
                ['historico', 'Histórico', o.history.length],
              ].map(([k, l, n]) => (
                <Link
                  key={k}
                  href={`?tab=${k}`}
                  className={cx(
                    '-mb-px border-b-2 py-3',
                    tab === k ? 'border-ink font-semibold' : 'border-transparent text-muted',
                  )}
                >
                  {l} <span className="text-[11px] text-faint">{n}</span>
                </Link>
              ))}
            </div>
            {tab === 'timeline' &&
              o.activities.map(({ a, actor }) => (
                <div key={a.id} className="flex gap-4 border-b border-line px-5 py-3.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {ACTIVITY_LABEL[a.type]}
                      {actor ? ` · ${actor}` : ''}
                    </div>
                    <div className="text-muted">{a.summary}</div>
                  </div>
                  <span className="font-mono text-[11.5px] text-faint">{dateTime(a.occurredAt)}</span>
                </div>
              ))}
            {tab === 'propostas' && (
              <div className="space-y-4 p-5">
                {canEdit && op.state === 'open' && <NewProposal opportunityId={op.id} />}
                {o.proposals.map((p) => {
                  const v = p.versions[0];
                  return (
                    <div key={p.id} className="rounded-lg border border-line">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                        <div>
                          <span className="font-mono">{p.number}</span> ·{' '}
                          <span className="font-medium">{p.title}</span>{' '}
                          <span className="text-faint">v{p.currentVersion}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill tone={PROPOSAL_STATUS[p.status]![1]}>{PROPOSAL_STATUS[p.status]![0]}</Pill>
                          {canEdit && (
                            <ProposalActions
                              id={p.id}
                              status={p.status}
                              items={(v?.items ?? []).map((i) => ({
                                description: i.description,
                                kind: i.kind as 'setup',
                                quantity: i.quantity,
                                unitCents: i.unitCents,
                              }))}
                            />
                          )}
                        </div>
                      </div>
                      <table className="w-full text-[12.5px]">
                        <tbody>
                          {v?.items.map((i) => (
                            <tr key={i.id} className="border-b border-line last:border-0">
                              <td className="px-4 py-2">{i.description}</td>
                              <td className="px-4 py-2 text-muted">
                                {i.kind === 'setup' ? 'Setup' : 'Mensal'}
                              </td>
                              <td className="num px-4 py-2 text-right">{money(i.quantity * i.unitCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {p.versions.length > 1 && (
                        <div className="border-t border-line px-4 py-2 text-[12px] text-faint">
                          Versões anteriores preservadas:{' '}
                          {p.versions
                            .slice(1)
                            .map((x) => `v${x.number}`)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!o.proposals.length && <div className="text-muted">Nenhuma proposta ainda.</div>}
              </div>
            )}
            {tab === 'reunioes' && (
              <div className="p-5">
                {o.meetings.length ? (
                  o.meetings.map((m) => (
                    <div key={m.id} className="py-1.5">
                      {dateTime(m.startsAt)} · {m.title}
                    </div>
                  ))
                ) : (
                  <span className="text-muted">Nenhuma reunião.</span>
                )}
              </div>
            )}
            {tab === 'historico' &&
              o.history.map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between border-b border-line px-5 py-2.5 last:border-0"
                >
                  <span className="font-mono text-[12px]">{h.action}</span>
                  <span className="text-[12px] text-faint">{dateTime(h.createdAt)}</span>
                </div>
              ))}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="text-[12px] text-muted">Setup</div>
                <div className="num text-[20px] font-semibold">{money(op.setupCents)}</div>
              </div>
              <div>
                <div className="text-[12px] text-muted">MRR potencial</div>
                <div className="num text-[20px] font-semibold">{money(op.mrrCents)}</div>
              </div>
              <div>
                <div className="text-[12px] text-muted">Probabilidade</div>
                <div className="num text-[20px] font-semibold">{prob}%</div>
              </div>
              <div>
                <div className="text-[12px] text-muted">Previsão de fechamento</div>
                <div className="num text-[20px] font-semibold">
                  {op.expectedCloseOn ? dateFull(op.expectedCloseOn) : '—'}
                </div>
              </div>
            </div>
          </Card>
          <Card title="Dados do lead">
            <Meta
              rows={[
                [
                  'Contato',
                  o.person ? `${o.person.name}${o.person.roleTitle ? ` · ${o.person.roleTitle}` : ''}` : '—',
                ],
                ['WhatsApp', o.person?.phone ?? '—'],
                ['E-mail', o.person?.email ?? '—'],
                ['Instagram', o.organization.instagram ?? '—'],
                ['Segmento', o.organization.segment ?? '—'],
                ['Cidade', o.organization.city ?? '—'],
                ['Origem', [op.source, o.lead?.campaign].filter(Boolean).join(' · ') || '—'],
                ['Serviço', op.service ?? '—'],
                ['Necessidade', o.lead?.need ?? '—'],
                ['Orçamento', o.lead?.budget ?? '—'],
                ['Criada em', dateShort(op.createdAt)],
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
