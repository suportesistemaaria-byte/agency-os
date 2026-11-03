import { slaSettings } from '@aos/domain';
import { dateFull } from '@aos/domain/format';
import { requireCtx } from '@/server/session';
import { Card, Table } from '@/components/ui';
import { HolidayForm, PolicyAmount, RemoveHoliday } from './actions';

export const dynamic = 'force-dynamic';
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function SlaSettings() {
  const ctx = await requireCtx();
  const s = await slaSettings(ctx);
  const can = ctx.perms.has('settings.manage');
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Expediente">
        {DAYS.map((d, i) => {
          const ps = s.calendar?.periods[i as 0] ?? [];
          return (
            <div key={d} className="flex justify-between border-b border-line py-2 last:border-0">
              <span>{d}</span>
              <span className="font-mono text-[12.5px] text-muted">
                {ps.length ? ps.map((p) => `${hm(p.start)}–${hm(p.end)}`).join(' · ') : 'fechado'}
              </span>
            </div>
          );
        })}
        <p className="mt-2 text-[12px] text-faint">
          Fuso {s.calendar?.timezone}. Períodos semiabertos: 13:00 e 19:00 já são fora do expediente.
        </p>
      </Card>
      <Card title="Políticas de SLA" pad={false}>
        <p className="px-5 pt-4 text-[12px] text-muted">
          Mudar a política vale para novos relógios; prazos em andamento guardam o snapshot.
        </p>
        {s.policies.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border-b border-line px-5 py-2.5 last:border-0"
          >
            <span>
              {p.name} <span className="font-mono text-[11px] text-faint">{p.key}</span>
            </span>
            <PolicyAmount
              id={p.id}
              amount={p.amount}
              unit={p.model === 'business_days' ? 'dias úteis' : 'horas úteis'}
              can={can}
            />
          </div>
        ))}
      </Card>
      <div className="xl:col-span-2">
        <Card title="Feriados" action={can && <HolidayForm />} pad={false}>
          <Table head={['Data', 'Nome', 'Tipo', '']}>
            {s.holidays.map((h) => (
              <tr key={h.id}>
                <td>{dateFull(h.date)}</td>
                <td>{h.name}</td>
                <td>
                  {
                    { national: 'Nacional', state: 'Estadual', municipal: 'Municipal', recess: 'Recesso' }[
                      h.kind
                    ]
                  }
                </td>
                <td>{can && <RemoveHoliday id={h.id} />}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
