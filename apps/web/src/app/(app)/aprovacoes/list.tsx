'use client';
import { useState } from 'react';
import Link from 'next/link';
import { dateShort, dateTime } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Modal, useAction } from '@/components/client';
import { Button, ClientTag, Empty, Field, Pill, Textarea } from '@/components/ui';
import { StagePill, Thumb } from '@/components/domain-ui';

interface Item {
  id: string;
  title: string;
  clientName: string;
  clientColor: string | null;
  platform: string;
  format: string;
  stage: string;
  scheduledAt: Date | null;
  submittedAt: Date | null;
  responseDueAt: Date | null;
  late: boolean;
  thumbFileId: string | null;
  thumbMime: string | null;
  caption: string | null;
  currentVersion: number;
}

/** Lista da central com seleção para aprovação em lote (em nome do cliente, com justificativa). */
export function ApprovalList({
  items,
  selectable,
  canApproveOnBehalf,
}: {
  items: Item[];
  selectable: boolean;
  canApproveOnBehalf: boolean;
}) {
  const { run } = useAction();
  const [sel, setSel] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [just, setJust] = useState('');
  if (!items.length) return <Empty title="Nada nesta aba" />;
  return (
    <div>
      {selectable && canApproveOnBehalf && (
        <div className="mb-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <input
              type="checkbox"
              className="accent-[#1a1a18]"
              checked={sel.length === items.length}
              onChange={(e) => setSel(e.target.checked ? items.map((i) => i.id) : [])}
            />
            Selecionar todos
          </label>
          <Button size="sm" variant="primary" disabled={!sel.length} onClick={() => setOpen(true)}>
            Aprovar {sel.length || ''} em nome do cliente
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((c) => (
          <div key={c.id} className="rounded-[10px] border border-line p-3">
            <div className="relative">
              <Thumb fileId={c.thumbFileId} mime={c.thumbMime} label={c.format} />
              {selectable && canApproveOnBehalf && (
                <input
                  type="checkbox"
                  aria-label="Selecionar"
                  className="absolute top-2 left-2 h-4 w-4 accent-[#1a1a18]"
                  checked={sel.includes(c.id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))}
                />
              )}
            </div>
            <Link href={`/conteudos/${c.id}`} className="mt-2 block font-semibold">
              {c.title}
            </Link>
            <div className="mt-1 flex items-center justify-between">
              <ClientTag name={c.clientName} color={c.clientColor} />
              <span className="font-mono text-[11px] text-faint">V{c.currentVersion}</span>
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {c.platform} · {c.format} · {c.scheduledAt ? dateTime(c.scheduledAt) : 'sem data'}
            </div>
            {c.caption && <div className="mt-1 line-clamp-2 text-[12px] text-muted">{c.caption}</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StagePill stage={c.stage} />
              {c.late ? (
                <Pill tone="bad">Resposta atrasada</Pill>
              ) : c.responseDueAt ? (
                <Pill tone="neutral">resposta até {dateShort(c.responseDueAt)}</Pill>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Aprovar ${sel.length} conteúdo(s) em nome do cliente`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={just.trim().length < 10}
              onClick={() =>
                run(
                  () => api.content.approveOnBehalf.mutate({ ids: sel, justification: just }),
                  'Aprovados em lote (uma aprovação por conteúdo, na mesma transação).',
                ).then((r) => r !== undefined && (setOpen(false), setSel([]), setJust('')))
              }
            >
              Aprovar
            </Button>
          </>
        }
      >
        <Field label="Justificativa (obrigatória, vai para a auditoria)">
          <Textarea value={just} onChange={(e) => setJust(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
