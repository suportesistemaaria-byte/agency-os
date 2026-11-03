import { portalRequests } from '@aos/domain';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@aos/domain/labels';
import { dateShort, dateTime } from '@aos/domain/format';
import { requirePortal } from '@/server/session';
import { NewPortalRequest } from './form';

export const dynamic = 'force-dynamic';

export default async function PortalRequests() {
  const p = await requirePortal();
  const rows = await portalRequests(p);
  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold">Solicitações</h1>
      {p.flags.canRequest ? (
        <NewPortalRequest />
      ) : (
        <p className="text-muted">Seu acesso não permite abrir solicitações.</p>
      )}
      <section className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{r.title}</span>
              <span className="shrink-0 rounded-md bg-side px-2 py-0.5 text-[11.5px]">
                {REQUEST_STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="text-[12px] text-muted">
              {REQUEST_TYPE_LABEL[r.type]} · aberta em {dateShort(r.createdAt)}
              {r.sla?.dueAt && !['delivered', 'cancelled'].includes(r.status)
                ? ` · previsão ${dateTime(r.sla.dueAt)}`
                : ''}
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-muted">Nenhuma solicitação ainda.</p>}
      </section>
    </div>
  );
}
