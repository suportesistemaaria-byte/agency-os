import { portalMeetings } from '@aos/domain';
import { dateTime } from '@aos/domain/format';
import { requirePortal } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function PortalMeetings() {
  const p = await requirePortal();
  const rows = await portalMeetings(p);
  const now = new Date();
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">Reuniões</h1>
      {rows.map((m) => (
        <div
          key={m.id}
          className={`rounded-xl border border-line p-3 ${m.startsAt < now ? 'opacity-60' : ''}`}
        >
          <div className="font-medium">{m.title}</div>
          <div className="text-[12px] text-muted">
            {dateTime(m.startsAt)} · {m.location ?? ''}
            {m.startsAt < now ? ' · realizada' : ''}
          </div>
        </div>
      ))}
      {!rows.length && <p className="text-muted">Nenhuma reunião marcada.</p>}
    </div>
  );
}
