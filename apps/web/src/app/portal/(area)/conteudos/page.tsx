import Link from 'next/link';
import { portalContents } from '@aos/domain';
import { dateTime } from '@aos/domain/format';
import { requirePortal } from '@/server/session';
import { PortalStage, PortalThumb } from '@/components/portal';

export const dynamic = 'force-dynamic';

export default async function PortalContents() {
  const p = await requirePortal();
  const rows = await portalContents(p);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.scheduledAt
      ? r.scheduledAt.toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric',
          timeZone: 'America/Sao_Paulo',
        })
      : 'Sem data';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-semibold">Conteúdos</h1>
      {!rows.length && <p className="text-muted">Ainda não há conteúdos enviados para você.</p>}
      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="mb-2 font-semibold capitalize">{month}</h2>
          <div className="space-y-2">
            {items.map((c) => (
              <Link
                key={c.id}
                href={`/portal/aprovacoes/${c.id}`}
                className="flex items-center gap-3 rounded-xl border border-line p-2.5"
              >
                <div className="w-16 shrink-0">
                  <PortalThumb fileId={c.thumbFileId} mime={c.thumbMime} label={c.format} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="text-[12px] text-muted">
                    {c.platform} · {c.format} · {c.scheduledAt ? dateTime(c.scheduledAt) : 'sem data'}
                  </div>
                  <div className="mt-1">
                    <PortalStage stage={c.stage} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
