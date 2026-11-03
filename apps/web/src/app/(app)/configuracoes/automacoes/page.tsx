import { listExecutions, listRules } from '@aos/domain';
import { dateTime } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Card, Chips, Pill, Table } from '@/components/ui';
import { RetryButton, RuleToggle } from './actions';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await requirePerm('settings.manage');
  const st = (await searchParams).s as 'ok' | 'skipped' | 'failed' | undefined;
  const [rules, execs] = await Promise.all([listRules(ctx), listExecutions(ctx, { status: st, limit: 150 })]);
  return (
    <div className="space-y-6">
      <p className="text-muted">
        QUANDO (evento) → SE (condições) → ENTÃO (ações). Cada regra executa uma única vez por evento; falhas
        ficam no histórico e podem ser reprocessadas. Cadeias de regras param na profundidade 3.
      </p>
      <Card title="Regras" pad={false}>
        <Table head={['Regra', 'Quando', 'Execuções', 'Última', 'Ativa']}>
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.name}</td>
              <td className="font-mono text-[12px]">{r.trigger.replace('|', ' ou ')}</td>
              <td className="text-[12.5px]">
                <span className="text-ok">{r.stats.ok} ok</span> ·{' '}
                <span className="text-muted">{r.stats.skipped} ignoradas</span>
                {r.stats.failed > 0 && <span className="text-bad"> · {r.stats.failed} falhas</span>}
              </td>
              <td className="text-muted">{r.stats.last ? dateTime(new Date(r.stats.last)) : '—'}</td>
              <td>
                <RuleToggle id={r.id} active={r.active} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card
        title="Histórico de execuções"
        action={
          <Chips
            active={st ?? 'all'}
            items={[
              { key: 'all', label: 'Todas', href: '?' },
              { key: 'ok', label: 'OK', href: '?s=ok' },
              { key: 'skipped', label: 'Ignoradas', href: '?s=skipped' },
              { key: 'failed', label: 'Falhas', href: '?s=failed' },
            ]}
          />
        }
        pad={false}
      >
        <Table head={['Quando', 'Regra', 'Evento', 'Resultado', 'Duração', '']}>
          {execs.map(({ e, rule }) => (
            <tr key={e.id}>
              <td className="font-mono text-[12px]">{dateTime(e.createdAt)}</td>
              <td>{rule}</td>
              <td className="font-mono text-[12px]">{e.eventType}</td>
              <td>
                {e.status === 'ok' ? (
                  <Pill tone="ok">OK</Pill>
                ) : e.status === 'skipped' ? (
                  <Pill>Ignorada</Pill>
                ) : (
                  <Pill tone="bad">Falha</Pill>
                )}
                <span className="ml-2 text-[12px] text-muted">
                  {e.error ??
                    (e.result
                      ? Object.entries(e.result)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ')
                      : '')}
                </span>
              </td>
              <td className="num">{e.durationMs} ms</td>
              <td>{e.status === 'failed' && <RetryButton eventId={e.eventId} />}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
