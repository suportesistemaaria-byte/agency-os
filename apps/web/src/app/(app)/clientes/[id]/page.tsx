import Link from 'next/link';
import {
  performanceOverview,
  approvalCenter,
  clientHistory,
  getClient,
  listCampaigns,
  listClientFiles,
  listContents,
  listInvoices,
  listMeetings,
  listRequests,
  listTasks,
  memberOptions,
} from '@aos/domain';
import { CLIENT_STATUS_LABEL, TEAM_FUNCTIONS, INVOICE_STATUS_LABEL } from '@aos/domain/labels';
import { dateFull, dateShort, dateTime, money } from '@aos/domain/format';
import { requirePerm, guard } from '@/server/session';
import { Avatar, Card, Empty, Meta, Pill, Table, cx } from '@/components/ui';
import { ContentKanban, FeedPreview, MonthCalendar } from '@/components/content-views';
import { RequestStatusPill, SlaPill, StagePill } from '@/components/domain-ui';
import { TaskRow } from '@/components/task-row';
import { HealthBar } from '../health';
import { PerformanceView } from '@/components/performance-view';
import { ContactsEditor, TeamEditor, ClientQuickAdd, UploadFiles } from './client-actions';

export const dynamic = 'force-dynamic';

const TABS = [
  ['visao', 'Visão geral'],
  ['conteudos', 'Conteúdos'],
  ['calendario', 'Calendário'],
  ['kanban', 'Kanban'],
  ['solicitacoes', 'Solicitações'],
  ['tarefas', 'Tarefas'],
  ['aprovacoes', 'Aprovações'],
  ['campanhas', 'Campanhas'],
  ['reunioes', 'Reuniões'],
  ['arquivos', 'Arquivos'],
  ['performance', 'Performance'],
  ['financeiro', 'Financeiro'],
  ['configuracoes', 'Configurações'],
] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requirePerm('clientes.view');
  const { id } = await params;
  const tab = (await searchParams).tab ?? 'visao';
  const c = await guard(getClient(ctx, id));
  const has = (p: string) => ctx.perms.has(p);
  const contents =
    has('conteudo.view') && ['visao', 'conteudos', 'calendario', 'kanban'].includes(tab)
      ? await listContents(ctx, { clientId: id })
      : [];
  const tabs = TABS.filter(
    ([k]) =>
      (k !== 'financeiro' || c.showFinance) &&
      (!['conteudos', 'calendario', 'kanban', 'aprovacoes', 'campanhas'].includes(k) ||
        has('conteudo.view')) &&
      (k !== 'solicitacoes' || has('requests.view')) &&
      (k !== 'tarefas' || has('tasks.view')),
  );
  const month = new Date().toISOString().slice(0, 7);
  const contract = c.contracts[0];
  const cl = c.client;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
          style={{ background: cl.color ?? '#6f6e69' }}
        >
          {cl.name
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{cl.name}</h1>
            <Pill tone={cl.status === 'onboarding' ? 'info' : 'neutral'}>
              {CLIENT_STATUS_LABEL[cl.status]}
            </Pill>
          </div>
          <div className="text-muted">
            {[cl.segment, cl.plan && `plano ${cl.plan}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        {(has('conteudo.create') || has('requests.edit')) && (
          <ClientQuickAdd
            clientId={id}
            canContent={has('conteudo.create')}
            canRequest={has('requests.edit')}
          />
        )}
      </div>
      <div className="mb-5 grid grid-cols-2 border-y border-line md:grid-cols-7">
        {[
          [
            'Responsável',
            <span key="r" className="inline-flex items-center gap-1.5">
              <Avatar name={c.ownerName} />
              {c.ownerName}
            </span>,
          ],
          [
            'Equipe',
            <span key="t" className="flex -space-x-1">
              {c.team.map((t) => (
                <Avatar key={t.t.id} name={t.name} />
              ))}
            </span>,
          ],
          ...(c.showFinance
            ? [
                [
                  'MRR',
                  <span key="m" className="num font-semibold">
                    {money(c.stats.mrrCents)}
                  </span>,
                ] as const,
              ]
            : []),
          [
            'Health score',
            <span key="h" className="block w-28">
              <HealthBar score={c.health.score} />
            </span>,
          ],
          ...(c.showFinance
            ? [
                [
                  'Financeiro',
                  c.stats.overdueInvoices ? (
                    <Pill key="f" tone="bad">
                      Atrasado {c.stats.overdueInvoiceDays}d
                    </Pill>
                  ) : (
                    <Pill key="f" tone="ok">
                      Em dia
                    </Pill>
                  ),
                ] as const,
              ]
            : []),
          ['Renovação', c.stats.renewalDays !== null ? `em ${c.stats.renewalDays} dias` : '—'],
          ['Pendências', `${c.stats.openTasks} abertas`],
        ].map(([k, v], i) => (
          <div key={String(k)} className={cx('px-4 py-3 first:pl-0', i > 0 && 'border-l border-line')}>
            <div className="text-[12px] text-muted">{k}</div>
            <div className="mt-1">{v}</div>
          </div>
        ))}
      </div>
      <div className="mb-6 flex gap-5 overflow-x-auto border-b border-line">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`?tab=${k}`}
            className={cx(
              '-mb-px shrink-0 border-b-2 py-2.5',
              tab === k ? 'border-ink font-semibold' : 'border-transparent text-muted',
            )}
          >
            {l}
          </Link>
        ))}
      </div>

      {tab === 'visao' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Card title="Próximas entregas" pad={false}>
            {contents
              .filter((x) => x.scheduledAt && x.scheduledAt > new Date())
              .slice(-8)
              .reverse()
              .map((x) => (
                <Link
                  key={x.id}
                  href={`/conteudos/${x.id}`}
                  className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0 hover:bg-side"
                >
                  <span className="w-24 font-mono text-[12px] text-muted">{dateTime(x.scheduledAt)}</span>
                  <span className="flex-1 font-medium">{x.title}</span>
                  <span className="text-[12px] text-muted">
                    {x.platform} · {x.format}
                  </span>
                  <StagePill stage={x.stage} />
                </Link>
              ))}
            {!contents.some((x) => x.scheduledAt && x.scheduledAt > new Date()) && (
              <div className="px-5 py-6 text-muted">Nada agendado.</div>
            )}
          </Card>
          <div className="space-y-6">
            <Card title="Health score">
              <div className="mb-3 w-40">
                <HealthBar score={c.health.score} />
              </div>
              {c.health.factors.length ? (
                c.health.factors.map((f) => (
                  <div key={f.key} className="flex justify-between py-1 text-[12.5px]">
                    <span>{f.label}</span>
                    <span className={cx('num font-mono', f.points < 0 ? 'text-bad' : 'text-muted')}>
                      {f.points}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-muted">Nenhum ponto perdido.</div>
              )}
            </Card>
            {c.onboarding && !c.onboarding.completedAt && (
              <Card title="Onboarding">
                <div className="mb-2 text-muted">
                  {c.onboarding.steps.filter((s) => s.step.doneAt).length} de {c.onboarding.steps.length}{' '}
                  etapas
                </div>
                <Link href="/clientes/onboarding" className="text-[12.5px] text-muted">
                  Abrir onboarding →
                </Link>
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === 'conteudos' && <FeedPreview clientId={id} items={contents} />}
      {tab === 'calendario' && <MonthCalendar month={month} items={contents} />}
      {tab === 'kanban' && <ContentKanban items={contents} />}
      {tab === 'solicitacoes' &&
        (async () => {
          const rs = await listRequests(ctx, { clientId: id });
          return rs.length ? (
            <Table head={['Solicitação', 'Tipo', 'Status', 'Responsável', 'SLA']}>
              {rs.map((r) => (
                <tr key={r.id} className="hover:bg-side">
                  <td>
                    <Link href={`/solicitacoes/${r.id}`} className="font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.type}</td>
                  <td>
                    <RequestStatusPill status={r.status} />
                  </td>
                  <td>{r.assigneeName ?? '—'}</td>
                  <td>
                    <SlaPill sla={r.sla} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nenhuma solicitação" />
          );
        })()}
      {tab === 'tarefas' &&
        (async () => {
          const ts = await listTasks(ctx, { clientId: id });
          return (
            <Card pad={false}>
              {ts.length ? (
                ts.map((t) => <TaskRow key={t.id} t={t} />)
              ) : (
                <div className="p-6 text-muted">Nenhuma tarefa.</div>
              )}
            </Card>
          );
        })()}
      {tab === 'aprovacoes' &&
        (async () => {
          const a = await approvalCenter(ctx, id);
          const all = [...a.waiting, ...a.changes, ...a.approved];
          return all.length ? (
            <Table head={['Conteúdo', 'Etapa', 'Enviado', 'Resposta']}>
              {all.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/conteudos/${x.id}`} className="font-medium">
                      {x.title}
                    </Link>
                  </td>
                  <td>
                    <StagePill stage={x.stage} />
                  </td>
                  <td>{x.submittedAt ? dateShort(x.submittedAt) : '—'}</td>
                  <td>
                    {x.late ? (
                      <Pill tone="bad">Atrasada</Pill>
                    ) : x.responseDueAt ? (
                      dateTime(x.responseDueAt)
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nada em aprovação" />
          );
        })()}
      {tab === 'campanhas' &&
        (async () => {
          const cs = await listCampaigns(ctx, id);
          return cs.length ? (
            <Table head={['Campanha', 'Objetivo', 'Período', 'Conteúdos']}>
              {cs.map((x) => (
                <tr key={x.c.id}>
                  <td className="font-medium">{x.c.name}</td>
                  <td>{x.c.objective ?? '—'}</td>
                  <td>
                    {dateShort(x.c.startsOn)} – {dateShort(x.c.endsOn)}
                  </td>
                  <td>{x.n}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nenhuma campanha">Campanhas completas chegam no Bloco 9 (Gestão).</Empty>
          );
        })()}
      {tab === 'reunioes' &&
        (async () => {
          const ms = await listMeetings(
            ctx,
            new Date(Date.now() - 90 * 86_400_000),
            new Date(Date.now() + 90 * 86_400_000),
            { clientId: id },
          );
          return ms.length ? (
            <Table head={['Reunião', 'Quando', 'Participantes']}>
              {ms.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.title}</td>
                  <td>{dateTime(m.startsAt)}</td>
                  <td>{m.participants.map((p) => p.name).join(', ')}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="Nenhuma reunião" />
          );
        })()}
      {tab === 'arquivos' &&
        (async () => {
          const fs = await listClientFiles(ctx, id);
          return (
            <div className="space-y-4">
              <UploadFiles clientId={id} />
              {fs.length ? (
                <Table head={['Arquivo', 'Tipo', 'Tamanho', 'Enviado']}>
                  {fs.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <a href={`/api/files/${f.id}`} target="_blank" className="font-medium">
                          {f.name}
                        </a>
                      </td>
                      <td>{f.mime}</td>
                      <td className="num">{Math.round(f.size / 1024)} KB</td>
                      <td>{dateShort(f.createdAt)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty title="Nenhum arquivo" />
              )}
            </div>
          );
        })()}
      {tab === 'performance' &&
        (has('reports.view') ? (
          (async () => (
            <PerformanceView o={await performanceOverview(ctx, { clientId: id })} showClient={false} />
          ))()
        ) : (
          <Empty title="Sem acesso a relatórios">Peça ao Admin a permissão de relatórios.</Empty>
        ))}
      {tab === 'financeiro' &&
        c.showFinance &&
        (async () => {
          const inv = await listInvoices(ctx, { clientId: id });
          return (
            <Table head={['Fatura', 'Descrição', 'Competência', 'Vencimento', 'Valor', 'Pago', 'Status']}>
              {inv.map((i) => (
                <tr key={i.id}>
                  <td className="font-mono">{i.number}</td>
                  <td>{i.description}</td>
                  <td>{i.competence}</td>
                  <td>{dateFull(i.dueOn)}</td>
                  <td className="num">{money(i.amountCents)}</td>
                  <td className="num">{money(i.paidCents)}</td>
                  <td>
                    <Pill tone={i.status === 'paid' ? 'ok' : i.status === 'overdue' ? 'bad' : 'warn'}>
                      {INVOICE_STATUS_LABEL[i.status]}
                    </Pill>
                  </td>
                </tr>
              ))}
            </Table>
          );
        })()}
      {tab === 'configuracoes' &&
        (async () => {
          const members = await memberOptions(ctx);
          const hist = await clientHistory(ctx, id);
          const canEdit = has('clientes.edit');
          return (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Contatos e permissões do portal" pad={false}>
                <ContactsEditor
                  canEdit={canEdit}
                  clientId={id}
                  contacts={c.contacts.map((x) => ({
                    id: x.contact.id,
                    name: x.person.name,
                    email: x.person.email,
                    role: x.person.roleTitle,
                    flags: {
                      canView: x.contact.canView,
                      canComment: x.contact.canComment,
                      canRequest: x.contact.canRequest,
                      canApprove: x.contact.canApprove,
                      receivesFinance: x.contact.receivesFinance,
                      receivesNotifications: x.contact.receivesNotifications,
                    },
                    isPrimary: x.contact.isPrimary,
                    portal: Boolean(x.contact.userId),
                  }))}
                />
              </Card>
              <Card title="Equipe da conta (responsável padrão por função)">
                <TeamEditor
                  canEdit={canEdit}
                  clientId={id}
                  members={members}
                  team={Object.fromEntries(
                    Object.keys(TEAM_FUNCTIONS).map((f) => [
                      f,
                      c.team.find((t) => t.t.function === f)?.t.memberId ?? '',
                    ]),
                  )}
                />
              </Card>
              <Card title="Contrato e serviços">
                {contract ? (
                  <Meta
                    rows={[
                      ['Número', contract.number],
                      [
                        'Status',
                        contract.status === 'pending_finance_confirmation' ? (
                          <Pill key="s" tone="info">
                            Aguardando Financeiro
                          </Pill>
                        ) : contract.status === 'active' ? (
                          <Pill key="s" tone="ok">
                            Vigente
                          </Pill>
                        ) : (
                          contract.status
                        ),
                      ],
                      ['Vigência', `${dateFull(contract.startOn)} a ${dateFull(contract.endOn)}`],
                      ['Dia de cobrança', String(contract.billingDay)],
                      ['Limite de alterações', `${contract.changeLimit} por peça`],
                      ...(c.showFinance
                        ? contract.items.map(
                            (i) =>
                              [
                                i.kind === 'setup' ? 'Setup' : 'Serviço mensal',
                                `${i.description} · ${money(i.amountCents)}`,
                              ] as [string, string],
                          )
                        : []),
                    ]}
                  />
                ) : (
                  <span className="text-muted">Sem contrato.</span>
                )}
              </Card>
              <Card title="Dados da empresa">
                <Meta
                  rows={[
                    ['Razão social', c.organization.legalName ?? '—'],
                    ['CNPJ', c.organization.cnpj ?? '—'],
                    ['Cidade', c.organization.city ?? '—'],
                    ['Instagram', c.organization.instagram ?? '—'],
                    ['Cliente desde', dateFull(cl.startedOn)],
                  ]}
                />
              </Card>
              <Card title="Histórico" pad={false} className="xl:col-span-2">
                {hist.events.slice(0, 40).map((e) => (
                  <div
                    key={e.id}
                    className="flex justify-between border-b border-line px-5 py-2 last:border-0"
                  >
                    <span className="font-mono text-[12px]">{e.type}</span>
                    <span className="text-[12px] text-faint">{dateTime(e.occurredAt)}</span>
                  </div>
                ))}
              </Card>
            </div>
          );
        })()}
    </div>
  );
}
