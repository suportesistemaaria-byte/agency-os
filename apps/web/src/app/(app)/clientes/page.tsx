import Link from 'next/link';
import { portfolio } from '@aos/domain';
import { CLIENT_STATUS_LABEL } from '@aos/domain/labels';
import { money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Avatar, Chips, Empty, PageHeader, Pill, Stats, Table, Tabs, cx } from '@/components/ui';
import { HealthBar } from './health';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; v?: string }>;
}) {
  const ctx = await requirePerm('clientes.view');
  const { f = 'all', v = 'list' } = await searchParams;
  const { clients, showFinance } = await portfolio(ctx);
  const filtered = clients.filter((c) =>
    f === 'all'
      ? true
      : f === 'onboarding'
        ? c.status === 'onboarding'
        : f === 'healthy'
          ? c.health.band === 'healthy'
          : f === 'attention'
            ? c.health.band === 'attention'
            : c.health.band === 'critical',
  );
  const active = clients.filter((c) => c.status !== 'churned');
  const mrr = active.reduce((a, c) => a + (c.mrrCents ?? 0), 0);
  const att = clients.filter((c) => c.health.band === 'attention');
  const crit = clients.filter((c) => c.health.band === 'critical');
  const renew = clients.filter((c) => c.renewalDays !== null && c.renewalDays <= 30);
  const q = (k: string, val: string) => `?f=${k === 'f' ? val : f}&v=${k === 'v' ? val : v}`;
  return (
    <div>
      <PageHeader
        eyebrow="Clientes"
        title="Carteira de clientes"
        subtitle={`${clients.filter((c) => c.status === 'active' || c.status === 'attention' || c.status === 'critical').length} ativos · ${clients.filter((c) => c.status === 'onboarding').length} em onboarding · ${clients.filter((c) => c.status === 'paused').length} pausado`}
        actions={
          <Tabs
            active={v}
            items={[
              { key: 'list', label: 'Lista', href: q('v', 'list') },
              { key: 'cards', label: 'Cards', href: q('v', 'cards') },
            ]}
          />
        }
      />
      <Stats
        items={[
          ...(showFinance
            ? [
                {
                  label: 'MRR da carteira',
                  value: money(mrr),
                  tone: 'ok' as const,
                  hint: `ticket médio ${money(Math.round(mrr / Math.max(1, active.length)))}`,
                },
              ]
            : []),
          {
            label: 'Em atenção',
            value: att.length,
            tone: 'warn',
            hint: att.map((c) => c.name).join(', ') || '—',
          },
          {
            label: 'Críticos',
            value: crit.length,
            tone: crit.length ? 'bad' : 'neutral',
            hint: crit.map((c) => c.name).join(', ') || '—',
          },
          {
            label: 'Renovações ≤ 30 dias',
            value: renew.length,
            hint: renew.map((c) => c.name).join(' · ') || '—',
          },
        ]}
      />
      <div className="mb-4">
        <Chips
          active={f}
          items={[
            { key: 'all', label: 'Todos', href: q('f', 'all') },
            { key: 'healthy', label: 'Saudáveis', href: q('f', 'healthy') },
            { key: 'attention', label: 'Em atenção', href: q('f', 'attention') },
            { key: 'critical', label: 'Críticos', href: q('f', 'critical') },
            { key: 'onboarding', label: 'Onboarding', href: q('f', 'onboarding') },
          ]}
        />
      </div>
      {!filtered.length && <Empty title="Nenhum cliente neste filtro" />}
      {v === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="rounded-[10px] border border-line p-4 hover:bg-side"
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-9 w-9 place-items-center rounded-lg text-[12px] font-bold text-white"
                  style={{ background: c.color ?? '#6f6e69' }}
                >
                  {c.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="text-[12px] text-muted">
                    {c.segment} · {c.plan}
                  </span>
                </span>
              </div>
              <div className="mt-4">
                <HealthBar score={c.health.score} />
              </div>
              <div className="mt-3 flex justify-between text-[12px] text-muted">
                <span>{c.openTasks} pendências</span>
                {showFinance && <span className="num font-medium text-ink">{money(c.mrrCents)}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        filtered.length > 0 && (
          <Table
            head={[
              'Cliente',
              'Status',
              'Responsável',
              'Plano',
              ...(showFinance ? ['MRR'] : []),
              'Health score',
              'Aprov.',
              'Pend.',
              ...(showFinance ? ['Financeiro'] : []),
              'Renovação',
            ]}
          >
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-side">
                <td>
                  <Link href={`/clientes/${c.id}`} className="flex items-center gap-3">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white"
                      style={{ background: c.color ?? '#6f6e69' }}
                    >
                      {c.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <span>
                      <span className="block font-medium">{c.name}</span>
                      <span className="text-[12px] text-faint">{c.segment}</span>
                    </span>
                  </Link>
                </td>
                <td>
                  <Pill
                    tone={c.status === 'onboarding' ? 'info' : c.status === 'paused' ? 'neutral' : 'neutral'}
                    dot={c.status !== 'active'}
                  >
                    {CLIENT_STATUS_LABEL[c.status]}
                  </Pill>
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={c.ownerName} />
                    {c.ownerName}
                  </span>
                </td>
                <td>{c.plan}</td>
                {showFinance && <td className="num font-medium">{money(c.mrrCents)}</td>}
                <td className="w-44">
                  <HealthBar
                    score={c.health.score}
                    title={c.health.factors.map((x) => `${x.label} (${x.points})`).join('\n')}
                  />
                </td>
                <td className={cx('num font-mono', c.waitingApprovals >= 3 && 'text-warn')}>
                  {c.waitingApprovals}
                </td>
                <td className="num font-mono">{c.openTasks}</td>
                {showFinance && (
                  <td>
                    {c.status === 'paused' ? (
                      <Pill tone="neutral">Suspenso</Pill>
                    ) : c.overdueInvoices ? (
                      <Pill tone="bad" dot={false} className="!bg-bad !text-white">
                        Atrasado {c.overdueInvoiceDays}d
                      </Pill>
                    ) : c.nextDueDays !== null && c.nextDueDays <= 3 ? (
                      <Pill tone="warn">Vence em {c.nextDueDays}d</Pill>
                    ) : (
                      <Pill tone="ok">Em dia</Pill>
                    )}
                  </td>
                )}
                <td className={cx(c.renewalDays !== null && c.renewalDays <= 30 && 'text-warn')}>
                  {c.renewalDays !== null ? `em ${c.renewalDays} dias` : '—'}
                </td>
              </tr>
            ))}
          </Table>
        )
      )}
    </div>
  );
}
