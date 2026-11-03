'use client';
import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { dateTime } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

export function TaskActions({
  id,
  status,
  assigneeId,
  members,
  clockId,
  canOverride,
}: {
  id: string;
  status: string;
  assigneeId: string | null;
  members: { id: string; name: string }[];
  clockId: string | null;
  canOverride: boolean;
}) {
  const { run, pending } = useAction();
  const [ov, setOv] = useState(false);
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const set = (s: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled', msg: string) =>
    run(() => api.tasks.setStatus.mutate({ id, status: s }), msg);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'blocked' && status !== 'done' && (
        <>
          {status === 'todo' && (
            <Button onClick={() => set('in_progress', 'Tarefa em andamento.')} disabled={pending}>
              Começar
            </Button>
          )}
          {status === 'in_progress' && (
            <Button onClick={() => set('review', 'Enviada para revisão.')} disabled={pending}>
              Enviar para revisão
            </Button>
          )}
          <Button variant="primary" onClick={() => set('done', 'Tarefa concluída.')} disabled={pending}>
            Concluir
          </Button>
        </>
      )}
      {status === 'done' && <Button onClick={() => set('todo', 'Tarefa reaberta.')}>Reabrir</Button>}
      <Select
        className="w-44"
        value={assigneeId ?? ''}
        onChange={(e) =>
          e.target.value &&
          run(() => api.tasks.assign.mutate({ id, assigneeId: e.target.value }), 'Responsável alterado.')
        }
      >
        <option value="">Sem responsável</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
      {clockId && canOverride && <Button onClick={() => setOv(true)}>Alterar prazo (SLA)</Button>}
      <Modal
        open={ov}
        onOpenChange={setOv}
        title="Alteração manual de SLA"
        footer={
          <>
            <Button onClick={() => setOv(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!due || reason.length < 5}
              onClick={() =>
                run(
                  () => api.tasks.overrideSla.mutate({ clockId: clockId!, dueAt: new Date(due), reason }),
                  'Prazo alterado e registrado na auditoria.',
                ).then((r) => r !== undefined && setOv(false))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <p className="text-muted">Exige a permissão sla.override; o motivo fica registrado na auditoria.</p>
        <Field label="Novo prazo">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Motivo (obrigatório)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

/** "Bloqueado por": motivo, quem resolve, início e observação. Bloquear pausa o SLA. */
export function BlockBox({
  id,
  block,
  canEdit,
  members,
}: {
  id: string;
  block: { reason: string; resolver: string; startedAt: Date; note: string | null } | null;
  canEdit: boolean;
  members: { id: string; name: string }[];
}) {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ reason: '', resolver: '', resolverMemberId: '', external: '1', note: '' });
  if (block)
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-[3px] border-bad bg-bad-bg/40 px-5 py-4">
        <Lock size={18} className="text-bad" />
        <div className="flex-1">
          <div className="text-[12px] text-bad">Bloqueado por</div>
          <div className="font-semibold">{block.reason}</div>
          <div className="text-[12px] text-muted">
            Quem resolve: {block.resolver} · desde {dateTime(block.startedAt)}
            {block.note ? ` · ${block.note}` : ''} · SLA pausado
          </div>
        </div>
        {canEdit && (
          <Button
            onClick={() =>
              run(() => api.tasks.unblock.mutate({ id }), 'Tarefa desbloqueada. O SLA voltou a correr.')
            }
          >
            <Unlock size={14} /> Desbloquear
          </Button>
        )}
      </div>
    );
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Lock size={14} /> Bloquear
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Bloquear tarefa"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!v.reason || !v.resolver}
              onClick={() =>
                run(
                  () =>
                    api.tasks.block.mutate({
                      id,
                      reason: v.reason,
                      resolver: v.resolver,
                      resolverMemberId: v.resolverMemberId || null,
                      external: v.external === '1',
                      note: v.note || undefined,
                    }),
                  'Tarefa bloqueada. O SLA está pausado.',
                ).then((r) => r !== undefined && setOpen(false))
              }
            >
              Bloquear
            </Button>
          </>
        }
      >
        <Field label="Motivo">
          <Input
            value={v.reason}
            onChange={(e) => setV({ ...v, reason: e.target.value })}
            placeholder="Ex.: aguardando fotos do cliente"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quem resolve">
            <Input
              value={v.resolver}
              onChange={(e) => setV({ ...v, resolver: e.target.value })}
              placeholder="Cliente, fornecedor, pessoa…"
            />
          </Field>
          <Field label="Membro responsável (opcional)">
            <Select
              value={v.resolverMemberId}
              onChange={(e) => setV({ ...v, resolverMemberId: e.target.value })}
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Origem">
            <Select value={v.external} onChange={(e) => setV({ ...v, external: e.target.value })}>
              <option value="1">Externa (cliente/terceiro)</option>
              <option value="0">Interna</option>
            </Select>
          </Field>
        </div>
        <Field label="Observação">
          <Textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </Field>
      </Modal>
    </>
  );
}

export function CommentBox({ id }: { id: string }) {
  const { run, pending } = useAction();
  const [body, setBody] = useState('');
  return (
    <form
      className="flex gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api.tasks.comment.mutate({ id, body }), 'Comentário enviado.').then(
          (r) => r !== undefined && setBody(''),
        );
      }}
    >
      <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário…" />
      <Button type="submit" variant="primary" disabled={pending || !body.trim()}>
        Enviar
      </Button>
    </form>
  );
}
