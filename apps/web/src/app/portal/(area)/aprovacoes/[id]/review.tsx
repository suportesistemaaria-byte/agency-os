'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { PortalThumb } from '@/components/portal';
import { useReauthApprove } from '../batch';

type Pin = { id?: string; x: number; y: number; asset: number; body: string };

/** Revisão no celular: toque na arte para marcar; aprovar ou pedir alteração (comentário e/ou marcações). */
export function PortalReview({
  id,
  stage,
  email,
  flags,
  assets,
  pins,
  format,
}: {
  id: string;
  stage: string;
  email: string;
  flags: { canApprove: boolean; canComment: boolean };
  assets: { fileId: string; mime: string }[];
  pins: Pin[];
  format: string;
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const { approve, modal } = useReauthApprove(email);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Pin[]>([]);
  const [editing, setEditing] = useState<{ x: number; y: number } | null>(null);
  const [pinText, setPinText] = useState('');
  const [comment, setComment] = useState('');
  const waiting = stage === 'client_approval';
  const all = [...pins, ...draft].filter((p) => p.asset === page && !Number.isNaN(p.x));
  const a = assets[page];
  return (
    <div className="space-y-4">
      <div>
        <div
          className="relative select-none"
          onClick={(e) => {
            if (!waiting || !flags.canComment || !a) return;
            const r = e.currentTarget.getBoundingClientRect();
            setEditing({
              x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
              y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
            });
          }}
        >
          <PortalThumb fileId={a?.fileId ?? null} mime={a?.mime} label={format} />
          {all.map((p, i) => (
            <span
              key={p.id ?? `d${i}`}
              title={p.body}
              className={`absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow ${p.id ? 'bg-change' : 'bg-ink'}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
        {assets.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <Button size="sm" onClick={() => setPage(Math.max(0, page - 1))} aria-label="Anterior">
              <ChevronLeft size={14} />
            </Button>
            <span className="text-[12px] text-muted">
              {page + 1} de {assets.length}
            </span>
            <Button
              size="sm"
              onClick={() => setPage(Math.min(assets.length - 1, page + 1))}
              aria-label="Próxima"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
        {waiting && flags.canComment && (
          <p className="mt-2 text-center text-[12px] text-muted">
            Toque na arte para marcar um ponto de ajuste.
          </p>
        )}
      </div>
      {all.length > 0 && (
        <ol className="space-y-1.5">
          {all.map((p, i) => (
            <li key={p.id ?? `l${i}`} className="rounded-lg border border-line px-3 py-2 text-[13px]">
              <b className="text-change">{i + 1}.</b> {p.body}
              {!p.id && <span className="text-faint"> (novo)</span>}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <Field label={`Marcação na posição ${editing.x}% × ${editing.y}%`}>
            <Input
              autoFocus
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
              placeholder="O que ajustar aqui?"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!pinText.trim()}
              onClick={() => {
                setDraft([...draft, { ...editing, asset: page, body: pinText.trim() }]);
                setEditing(null);
                setPinText('');
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>
      )}
      {waiting && (
        <div className="space-y-3">
          {flags.canComment && (
            <Field label="Comentário">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Descreva a alteração, se houver"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            {flags.canComment && (
              <Button
                disabled={pending || (!comment.trim() && !draft.length)}
                onClick={async () => {
                  const r = await run(
                    async () => {
                      await api.portal.requestChange.mutate({
                        id,
                        comment: comment.trim() || undefined,
                        annotations: draft.map((d) => ({
                          assetIndex: d.asset,
                          xPct: d.x,
                          yPct: d.y,
                          body: d.body,
                        })),
                      });
                      return true;
                    },
                    'Alteração enviada para a agência.',
                    { refresh: false },
                  );
                  if (r !== undefined) {
                    setDraft([]);
                    setComment('');
                    router.push('/portal/aprovacoes');
                    router.refresh();
                  }
                }}
              >
                Pedir alteração
              </Button>
            )}
            {flags.canApprove && (
              <Button
                variant="primary"
                disabled={pending || draft.length > 0}
                onClick={() => void approve([id], 'Aprovado. Obrigado!')}
              >
                Aprovar
              </Button>
            )}
          </div>
          {!flags.canApprove && (
            <p className="text-[12px] text-muted">
              Seu acesso permite comentar; a aprovação é feita por outro contato da sua empresa.
            </p>
          )}
        </div>
      )}
      {modal}
    </div>
  );
}
