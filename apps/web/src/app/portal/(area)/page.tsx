import Link from 'next/link';
import { portalHome } from '@aos/domain';
import { REQUEST_STATUS_LABEL } from '@aos/domain/labels';
import { dateTime } from '@aos/domain/format';
import { requirePortal } from '@/server/session';
import { PortalStage, PortalThumb } from '@/components/portal';

export const dynamic = 'force-dynamic';

export default async function PortalHome() {
  const p = await requirePortal();
  const h = await portalHome(p);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">Olá, {p.name.split(' ')[0]}</h1>
        <p className="text-muted">
          {h.waiting.length
            ? `${h.waiting.length} conteúdo(s) aguardando a sua aprovação.`
            : 'Nada aguardando você agora.'}
        </p>
      </div>
      {h.waiting.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Aguardando você</h2>
            <Link href="/portal/aprovacoes" className="text-[12.5px] text-muted">
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {h.waiting.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                href={`/portal/aprovacoes/${c.id}`}
                className="rounded-xl border border-line p-2"
              >
                <PortalThumb fileId={c.thumbFileId} mime={c.thumbMime} label={c.format} />
                <div className="mt-1.5 truncate font-medium">{c.title}</div>
                <div className="text-[11.5px] text-muted">
                  {c.platform} · {c.scheduledAt ? dateTime(c.scheduledAt) : 'sem data'}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-2 font-semibold">Próximas publicações</h2>
        {h.upcoming.length ? (
          h.upcoming.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
            >
              <span>
                <span className="block font-medium">{c.title}</span>
                <span className="text-[12px] text-muted">
                  {dateTime(c.scheduledAt)} · {c.platform}
                </span>
              </span>
              <PortalStage stage={c.stage} />
            </div>
          ))
        ) : (
          <p className="text-muted">Nada agendado ainda.</p>
        )}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Suas solicitações</h2>
          <Link href="/portal/solicitacoes" className="text-[12.5px] text-muted">
            Nova
          </Link>
        </div>
        {h.requests.length ? (
          h.requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
            >
              <span className="font-medium">{r.title}</span>
              <span className="text-[12px] text-muted">{REQUEST_STATUS_LABEL[r.status]}</span>
            </div>
          ))
        ) : (
          <p className="text-muted">Nenhuma em andamento.</p>
        )}
      </section>
      {h.meetings.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Próximas reuniões</h2>
          {h.meetings.map((m) => (
            <div key={m.id} className="border-b border-line py-2.5 last:border-0">
              <span className="font-medium">{m.title}</span>
              <span className="block text-[12px] text-muted">
                {dateTime(m.startsAt)} · {m.location ?? ''}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
