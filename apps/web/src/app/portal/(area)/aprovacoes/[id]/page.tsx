import { portalContent } from '@aos/domain';
import { dateTime } from '@aos/domain/format';
import { guard, requirePortal } from '@/server/session';
import { PortalStage } from '@/components/portal';
import { PortalReview } from './review';

export const dynamic = 'force-dynamic';

export default async function PortalContentPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requirePortal();
  const d = await guard(portalContent(p, (await params).id));
  const c = d.content;
  return (
    <div className="space-y-4">
      <div>
        <PortalStage stage={c.stage} />
        <h1 className="mt-1 text-[22px] font-semibold">{c.title}</h1>
        <p className="text-muted">
          {c.platform} · {c.format} · {c.scheduledAt ? dateTime(c.scheduledAt) : 'sem data'} · V
          {d.version?.number ?? '—'}
        </p>
      </div>
      <PortalReview
        id={c.id}
        stage={c.stage}
        email={p.email}
        flags={{ canApprove: p.flags.canApprove, canComment: p.flags.canComment }}
        assets={d.assets.map((a) => ({ fileId: a.fileId, mime: a.mime }))}
        pins={d.annotations.map((a) => ({
          id: a.id,
          x: Number(a.xPct),
          y: Number(a.yPct),
          asset: a.assetIndex,
          body: a.body,
        }))}
        format={c.format}
      />
      {d.copy && (
        <section className="space-y-2 rounded-xl border border-line p-4">
          {d.copy.hook && <p className="font-medium">{d.copy.hook}</p>}
          {d.copy.caption && <p className="whitespace-pre-wrap">{d.copy.caption}</p>}
          {d.copy.cta && <p className="text-muted">{d.copy.cta}</p>}
        </section>
      )}
      {d.comments.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Conversa</h2>
          {d.comments.map((m) => (
            <div key={m.id} className="rounded-xl bg-side px-3 py-2">
              <div className="text-[11.5px] text-muted">
                {m.author} · {dateTime(m.at)}
              </div>
              <div>{m.body}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
