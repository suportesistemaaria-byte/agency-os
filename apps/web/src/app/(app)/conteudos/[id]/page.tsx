import Link from 'next/link';
import { getContent, memberOptions } from '@aos/domain';
import { STAGE_LABEL, STAGES } from '@aos/domain/labels';
import { dateTime } from '@aos/domain/format';
import { requirePerm, guard } from '@/server/session';
import { Card, Meta, cx } from '@/components/ui';
import { StagePill } from '@/components/domain-ui';
import { ContentActions, Viewer, CommentForm } from './actions';

export const dynamic = 'force-dynamic';

const APPROVAL: Record<string, string> = {
  submitted: 'Enviado ao cliente',
  approved: 'Aprovado pelo cliente',
  change_requested: 'Alteração pedida',
  approved_on_behalf: 'Aprovado em nome do cliente',
  reopened: 'Reaberto',
};

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const ctx = await requirePerm('conteudo.view');
  const d = await guard(getContent(ctx, (await params).id));
  const c = d.content;
  const vNum = Number((await searchParams).v ?? c.currentVersion);
  const version = d.versions.find((v) => v.number === vNum) ?? d.versions[0];
  const idx = STAGES.indexOf(c.stage);
  const members = await memberOptions(ctx);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: d.client.color ?? '#a3a19b' }} />
            <Link href={`/clientes/${d.client.id}`}>{d.client.name}</Link>
            {d.campaign && <span>· {d.campaign.name}</span>}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{c.title}</h1>
            <StagePill stage={c.stage} />
          </div>
        </div>
        <ContentActions
          id={c.id}
          stage={c.stage}
          canEdit={d.canEdit}
          canApproveOnBehalf={d.canApproveOnBehalf}
          version={c.currentVersion}
          members={members}
          scheduledAt={c.scheduledAt}
        />
      </div>
      <div className="mb-6 grid gap-1" style={{ gridTemplateColumns: `repeat(${STAGES.length}, 1fr)` }}>
        {STAGES.map((s, i) => (
          <div key={s}>
            <div
              className={cx(
                'h-[3px] rounded',
                i <= idx ? 'bg-ink' : 'bg-line',
                s === 'change_requested' && c.stage === s && 'bg-change',
              )}
            />
            <div className={cx('mt-1.5 truncate text-[11px]', i === idx ? 'font-semibold' : 'text-muted')}>
              {STAGE_LABEL[s]}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <div className="space-y-6">
          <Card pad={false}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex gap-1.5">
                {d.versions.map((v) => (
                  <Link
                    key={v.id}
                    href={`?v=${v.number}`}
                    className={cx(
                      'rounded-md border px-2.5 py-1 text-[12.5px]',
                      v.number === version?.number ? 'border-ink font-semibold' : 'border-line text-muted',
                    )}
                  >
                    V{v.number}
                    {v.number === c.currentVersion && ' · atual'}
                  </Link>
                ))}
                {!d.versions.length && <span className="text-muted">Sem versões</span>}
              </div>
              <span className="text-[12px] text-faint">
                {version
                  ? `${d.annotations.filter((a) => a.a.versionId === version.id).length} marcadores`
                  : ''}
              </span>
            </div>
            <div className="p-4">
              <Viewer
                contentId={c.id}
                version={version?.number ?? 0}
                canAnnotate={!!version}
                assets={version?.assets.map((a) => ({ fileId: a.fileId, mime: a.file.mime })) ?? []}
                pins={d.annotations
                  .filter((a) => a.a.versionId === version?.id)
                  .map((a) => ({
                    id: a.a.id,
                    x: Number(a.a.xPct),
                    y: Number(a.a.yPct),
                    asset: a.a.assetIndex,
                    body: a.a.body,
                    author: a.member ?? a.contact ?? '',
                  }))}
                format={c.format}
              />
            </div>
          </Card>
          <Card title="Copy">
            {version?.copy ? (
              <div className="space-y-3">
                {(
                  [
                    ['Hook', version.copy.hook],
                    ['Legenda', version.copy.caption],
                    ['CTA', version.copy.cta],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[12px] text-muted">{k}</div>
                    <div className="mt-1 rounded-lg border border-line px-3 py-2 whitespace-pre-wrap">
                      {v || '—'}
                      {k === 'Legenda' && v ? <span className="text-faint"> ({v.length}/2200)</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-muted">A copy entra junto com a versão (versões são imutáveis).</span>
            )}
          </Card>
          <Card title="Comentários" pad={false}>
            {d.comments.map(({ c: cm, member, contact }) => (
              <div key={cm.id} className="border-b border-line px-5 py-3">
                <div className="text-[12px] text-muted">
                  {member ?? contact} · V{d.versions.find((v) => v.id === cm.versionId)?.number} ·{' '}
                  {cm.visibility === 'client' ? 'visível ao cliente' : 'interno'} · {dateTime(cm.createdAt)}
                </div>
                <div>{cm.body}</div>
              </div>
            ))}
            {version && <CommentForm id={c.id} />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <Meta
              rows={[
                ['Cliente', d.client.name],
                ['Plataforma', c.platform],
                ['Formato', c.format],
                ['Data', c.scheduledAt ? dateTime(c.scheduledAt) : 'Gaveta (sem data)'],
                ['Responsável', d.ownerName],
                ['Copywriter', d.copywriterName],
                ['Designer', d.designerName],
                ['Prioridade', c.priority],
                ['Objetivo', c.objective],
                ['Pilar', c.pillar],
              ]}
            />
          </Card>
          <Card title="Histórico e aprovação" pad={false}>
            {[
              ...d.approvals.map((a) => ({
                id: a.a.id,
                at: a.a.createdAt,
                text: `${APPROVAL[a.a.action]} · V${d.versions.find((v) => v.id === a.a.versionId)?.number ?? '?'} · ${a.member ?? a.contact ?? ''}${a.a.justification ? ` — “${a.a.justification}”` : ''}`,
                strong: a.a.action !== 'submitted',
              })),
              ...d.history.map((h) => ({
                id: h.h.id,
                at: h.h.createdAt,
                text: `${h.h.fromStage ? `${STAGE_LABEL[h.h.fromStage]} → ` : ''}${STAGE_LABEL[h.h.toStage]}${h.actor ? ` · ${h.actor}` : ''}${h.h.note ? ` · ${h.h.note}` : ''}`,
                strong: false,
              })),
            ]
              .sort((a, b) => b.at.getTime() - a.at.getTime())
              .map((e) => (
                <div
                  key={e.id}
                  className="flex gap-3 border-b border-line px-5 py-2.5 text-[12.5px] last:border-0"
                >
                  <span className="w-24 shrink-0 font-mono text-[11px] text-faint">{dateTime(e.at)}</span>
                  <span className={e.strong ? 'font-medium' : ''}>{e.text}</span>
                </div>
              ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
