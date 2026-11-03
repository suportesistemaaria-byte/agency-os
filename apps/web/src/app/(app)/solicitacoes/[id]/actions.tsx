'use client';
import { useState } from 'react';
import { REQUEST_FLOW, REQUEST_STATUS_LABEL } from '@aos/domain/labels';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, Select } from '@/components/ui';

type S = (typeof REQUEST_FLOW)[number] | 'cancelled';

export function RequestActions({
  id,
  status,
  members,
}: {
  id: string;
  status: string;
  members: { id: string; name: string }[];
}) {
  const { run, pending } = useAction();
  const [assignee, setAssignee] = useState('');
  const [scope, setScope] = useState('1');
  if (status === 'delivered' || status === 'cancelled') return null;
  if (status === 'triage' || status === 'received')
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line p-4">
        <span className="font-semibold">Triagem</span>
        <Select className="w-56" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Responsável padrão da equipe</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="1">Dentro do escopo</option>
          <option value="0">Fora do escopo</option>
        </Select>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            run(
              () => api.requests.triage.mutate({ id, assigneeId: assignee || null, inScope: scope === '1' }),
              'Triagem feita: SLA de produção iniciado e tarefa criada.',
            )
          }
        >
          Concluir triagem
        </Button>
      </div>
    );
  const i = REQUEST_FLOW.indexOf(status as S & (typeof REQUEST_FLOW)[number]);
  const next = REQUEST_FLOW[i + 1];
  const prev = i > 3 ? REQUEST_FLOW[i - 1] : undefined;
  const go = (s: S, msg: string) => run(() => api.requests.setStatus.mutate({ id, status: s }), msg);
  return (
    <div className="flex flex-wrap gap-2">
      {prev && (
        <Button onClick={() => go(prev, `Voltou para ${REQUEST_STATUS_LABEL[prev]}.`)}>
          ← {REQUEST_STATUS_LABEL[prev]}
        </Button>
      )}
      {next && (
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            go(
              next,
              next === 'client_approval'
                ? 'Aguardando cliente: SLA pausado.'
                : `Status: ${REQUEST_STATUS_LABEL[next]}.`,
            )
          }
        >
          {REQUEST_STATUS_LABEL[next]} →
        </Button>
      )}
      {status !== 'delivered' && next !== 'delivered' && (
        <Button onClick={() => go('delivered', 'Solicitação entregue.')}>Marcar como entregue</Button>
      )}
      <Button variant="danger" onClick={() => go('cancelled', 'Solicitação cancelada.')}>
        Cancelar
      </Button>
    </div>
  );
}
