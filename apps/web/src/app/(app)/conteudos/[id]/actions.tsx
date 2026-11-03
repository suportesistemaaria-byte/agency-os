'use client';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { STAGE_LABEL } from '@aos/domain/labels';
import { api } from '@/lib/trpc';
import { Menu, Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Thumb } from '@/components/domain-ui';

const FREE = ['idea', 'planning', 'production', 'copy', 'design', 'internal_review'] as const;
const toLocal = (d: Date | null) =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export function ContentActions({
  id,
  stage,
  canEdit,
  canApproveOnBehalf,
  version,
  scheduledAt,
}: {
  id: string;
  stage: string;
  canEdit: boolean;
  canApproveOnBehalf: boolean;
  version: number;
  members: { id: string; name: string }[];
  scheduledAt: Date | null;
}) {
  const { run, pending } = useAction();
  const [modal, setModal] = useState<null | 'version' | 'onbehalf' | 'change' | 'adjust' | 'schedule'>(null);
  const [text, setText] = useState('');
  const [when, setWhen] = useState(toLocal(scheduledAt));
  const [copy, setCopy] = useState({ hook: '', caption: '', cta: '' });
  const files = useRef<HTMLInputElement>(null);
  const close = () => (setModal(null), setText(''));
  if (!canEdit && !canApproveOnBehalf) return null;

  async function uploadVersion() {
    const fd = new FormData();
    fd.set('entityType', 'content');
    fd.set('entityId', id);
    for (const f of Array.from(files.current?.files ?? [])) fd.append('files', f);
    const r = await run(
      async () => {
        let ids: string[] = [];
        if (fd.getAll('files').length) {
          const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
          const j = (await res.json()) as { files?: { id: string }[]; error?: string };
          if (!res.ok) throw new Error(j.error ?? 'Falha no upload');
          ids = j.files!.map((f) => f.id);
        }
        return api.content.addVersion.mutate({ id, fileIds: ids, ...copy, note: text || undefined });
      },
      `V${version + 1} criada. A versão anterior foi preservada.`,
    );
    if (r) close();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && FREE.includes(stage as (typeof FREE)[number]) && (
        <Menu
          trigger={<Button>Mover etapa</Button>}
          items={FREE.filter((s) => s !== stage).map((s) => ({
            label: STAGE_LABEL[s],
            onSelect: () =>
              void run(() => api.content.move.mutate({ id, stage: s }), `Etapa: ${STAGE_LABEL[s]}.`),
          }))}
        />
      )}
      {canEdit && !['approved', 'scheduled', 'posted', 'client_approval'].includes(stage) && (
        <Button onClick={() => setModal('version')}>
          <Upload size={14} /> Nova versão
        </Button>
      )}
      {canEdit && <Button onClick={() => setModal('schedule')}>Data</Button>}
      {canEdit && stage === 'internal_review' && (
        <>
          <Button onClick={() => setModal('adjust')}>Pedir ajuste interno</Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => run(() => api.content.submit.mutate({ id }), 'Enviado para aprovação do cliente.')}
          >
            Enviar para aprovação
          </Button>
        </>
      )}
      {stage === 'client_approval' && (
        <>
          {canEdit && <Button onClick={() => setModal('change')}>Registrar alteração do cliente</Button>}
          {canApproveOnBehalf && (
            <Button variant="primary" onClick={() => setModal('onbehalf')}>
              Aprovar em nome do cliente
            </Button>
          )}
        </>
      )}
      {canEdit && stage === 'approved' && (
        <Button
          variant="primary"
          onClick={() => run(() => api.content.move.mutate({ id, stage: 'scheduled' }), 'Conteúdo agendado.')}
        >
          Agendar
        </Button>
      )}
      {canEdit && stage === 'scheduled' && (
        <Button
          variant="primary"
          onClick={() => run(() => api.content.move.mutate({ id, stage: 'posted' }), 'Marcado como postado.')}
        >
          Marcar como postado
        </Button>
      )}

      <Modal
        wide
        open={modal === 'version'}
        onOpenChange={(o) => !o && close()}
        title={`Nova versão (V${version + 1})`}
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button variant="primary" disabled={pending} onClick={uploadVersion}>
              Salvar versão
            </Button>
          </>
        }
      >
        <Field
          label="Arquivos da arte (imagem, PDF ou vídeo MP4)"
          hint="A ordem dos arquivos define as páginas do carrossel."
        >
          <input
            ref={files}
            type="file"
            multiple
            accept="image/*,application/pdf,video/mp4"
            className="block text-[13px]"
          />
        </Field>
        <Field label="Hook">
          <Input value={copy.hook} onChange={(e) => setCopy({ ...copy, hook: e.target.value })} />
        </Field>
        <Field label="Legenda">
          <Textarea
            value={copy.caption}
            onChange={(e) => setCopy({ ...copy, caption: e.target.value })}
            maxLength={2200}
          />
        </Field>
        <Field label="CTA">
          <Input value={copy.cta} onChange={(e) => setCopy({ ...copy, cta: e.target.value })} />
        </Field>
        <Field label="Nota da versão">
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>
      <Modal
        open={modal === 'onbehalf'}
        onOpenChange={(o) => !o && close()}
        title="Aprovar em nome do cliente"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={text.trim().length < 10}
              onClick={() =>
                run(
                  () => api.content.approveOnBehalf.mutate({ ids: [id], justification: text }),
                  'Aprovado em nome do cliente (registrado na auditoria).',
                ).then((r) => r !== undefined && close())
              }
            >
              Aprovar
            </Button>
          </>
        }
      >
        <p className="text-muted">
          A justificativa é obrigatória e fica registrada na auditoria e no histórico do conteúdo.
        </p>
        <Field label="Justificativa (mínimo 10 caracteres)">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Cliente aprovou por WhatsApp às 14h."
          />
        </Field>
      </Modal>
      <Modal
        open={modal === 'change'}
        onOpenChange={(o) => !o && close()}
        title="Alteração pedida pelo cliente"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() =>
                run(
                  () => api.content.requestChange.mutate({ id, comment: text }),
                  'Alteração registrada: tarefa com SLA criada para o responsável padrão.',
                ).then((r) => r !== undefined && close())
              }
            >
              Registrar
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Para marcar pontos na arte, clique na imagem. Aqui vai a descrição geral.
        </p>
        <Field label="O que o cliente pediu">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>
      <Modal
        open={modal === 'adjust'}
        onOpenChange={(o) => !o && close()}
        title="Pedir ajuste interno"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                run(() => api.content.internalAdjust.mutate({ id, note: text }), 'Voltou para Design.').then(
                  (r) => r !== undefined && close(),
                )
              }
            >
              Enviar
            </Button>
          </>
        }
      >
        <Field label="O que ajustar">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </Modal>
      <Modal
        open={modal === 'schedule'}
        onOpenChange={(o) => !o && close()}
        title="Data de publicação"
        footer={
          <>
            <Button
              onClick={() =>
                run(() => api.content.update.mutate({ id, scheduledAt: null }), 'Movido para a gaveta.').then(
                  (r) => r !== undefined && close(),
                )
              }
            >
              Mover para a gaveta
            </Button>
            <Button
              variant="primary"
              disabled={!when}
              onClick={() =>
                run(
                  () => api.content.update.mutate({ id, scheduledAt: new Date(when) }),
                  'Data atualizada.',
                ).then((r) => r !== undefined && close())
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Data e hora">
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

/** Visualizador da versão com marcadores (x/y em % da arte, por página do carrossel). Clique para marcar. */
export function Viewer({
  contentId,
  version,
  assets,
  pins,
  canAnnotate,
  format,
}: {
  contentId: string;
  version: number;
  assets: { fileId: string; mime: string }[];
  pins: { id: string; x: number; y: number; asset: number; body: string; author: string }[];
  canAnnotate: boolean;
  format: string;
}) {
  const { run } = useAction();
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const a = assets[page];
  const visible = pins.filter((p) => p.asset === page && !Number.isNaN(p.x));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <div>
        <div
          className="relative mx-auto max-w-[520px] cursor-crosshair select-none"
          onClick={(e) => {
            if (!canAnnotate || !a) return;
            const r = e.currentTarget.getBoundingClientRect();
            setDraft({
              x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
              y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
            });
          }}
        >
          <Thumb fileId={a?.fileId ?? null} mime={a?.mime} label={`${format} · sem arquivo`} />
          {visible.map((p, i) => (
            <button
              key={p.id}
              onClick={(e) => {
                e.stopPropagation();
                setActive(p.id === active ? null : p.id);
              }}
              className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-change text-[11px] font-bold text-white shadow"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={p.body}
            >
              {i + 1}
            </button>
          ))}
          {draft && (
            <span
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink"
              style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
            />
          )}
        </div>
        {assets.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button size="sm" onClick={() => setPage(Math.max(0, page - 1))}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-[12px] text-muted">
              Página {page + 1} de {assets.length}
            </span>
            <Button size="sm" onClick={() => setPage(Math.min(assets.length - 1, page + 1))}>
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-[12px] text-muted">
          Marcações na V{version}
          {canAnnotate ? ' · clique na arte para marcar' : ''}
        </div>
        {visible.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-lg border px-3 py-2 text-[12.5px] ${active === p.id ? 'border-change' : 'border-line'}`}
          >
            <b className="text-change">{i + 1}.</b> {p.body}
            <div className="text-[11px] text-faint">{p.author}</div>
          </div>
        ))}
        {!visible.length && <div className="text-[12.5px] text-faint">Nenhuma marcação nesta página.</div>}
      </div>
      <Modal
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title="Nova marcação"
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() =>
                run(
                  () =>
                    api.content.annotate.mutate({
                      id: contentId,
                      version,
                      assetIndex: page,
                      xPct: draft!.x,
                      yPct: draft!.y,
                      body: text,
                    }),
                  'Marcação adicionada.',
                ).then((r) => r !== undefined && (setDraft(null), setText('')))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Posição: {draft?.x}% × {draft?.y}% · página {page + 1}
        </p>
        <Field label="Observação">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}

export function CommentForm({ id }: { id: string }) {
  const { run, pending } = useAction();
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<'internal' | 'client'>('internal');
  return (
    <form
      className="flex gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.content.comment.mutate({ id, body, visibility: vis }), 'Comentário enviado.').then(
          (r) => r !== undefined && setBody(''),
        );
      }}
    >
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comentar na versão atual…" />
      <Select className="w-40" value={vis} onChange={(e) => setVis(e.target.value as 'internal')}>
        <option value="internal">Interno</option>
        <option value="client">Visível ao cliente</option>
      </Select>
      <Button type="submit" variant="primary" disabled={pending || !body.trim()}>
        Enviar
      </Button>
    </form>
  );
}
