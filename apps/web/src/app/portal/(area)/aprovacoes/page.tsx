import { portalContents } from '@aos/domain';
import { requirePortal } from '@/server/session';
import { BatchApprove } from './batch';

export const dynamic = 'force-dynamic';

export default async function PortalApprovals() {
  const p = await requirePortal();
  const waiting = (await portalContents(p)).filter((c) => c.stage === 'client_approval');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold">Aprovações</h1>
        <p className="text-muted">
          {waiting.length
            ? 'Toque em um conteúdo para ver, marcar pontos na arte e aprovar ou pedir alteração.'
            : 'Nada aguardando você. 👌'}
        </p>
      </div>
      {waiting.length > 0 && (
        <BatchApprove
          canApprove={p.flags.canApprove}
          email={p.email}
          items={waiting.map((c) => ({
            id: c.id,
            title: c.title,
            platform: c.platform,
            format: c.format,
            scheduledAt: c.scheduledAt,
            thumbFileId: c.thumbFileId,
            thumbMime: c.thumbMime,
            caption: c.caption,
            version: c.currentVersion,
          }))}
        />
      )}
    </div>
  );
}
