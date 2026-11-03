'use client';
import { useState } from 'react';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, Input, Select, Textarea } from '@/components/ui';

export function NotesEditor({ id, notes }: { id: string; notes: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(notes);
  return (
    <div className="space-y-2">
      <Textarea
        className="min-h-40"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Pauta, pontos discutidos, próximos passos…"
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={pending || v === notes}
          onClick={() => run(() => api.meetingNotes.mutate({ id, notes: v }), 'Ata salva.')}
        >
          Salvar ata
        </Button>
      </div>
    </div>
  );
}

export function DecisionForm({
  meetingId,
  members,
}: {
  meetingId: string;
  members: { id: string; name: string }[];
}) {
  const { run, pending } = useAction();
  const [desc, setDesc] = useState('');
  const [owner, setOwner] = useState('');
  const [sla, setSla] = useState('');
  return (
    <form
      className="flex flex-wrap gap-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api.meetingDecision.mutate({
              meetingId,
              description: desc,
              ownerId: owner,
              slaPolicyKey: sla || undefined,
            }),
          'Decisão registrada e tarefa criada.',
        ).then((r) => r && (setDesc(''), setOwner('')));
      }}
    >
      <Input
        className="min-w-60 flex-1"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Decisão (vira tarefa)"
      />
      <Select className="w-40" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">Responsável…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
      <Select className="w-48" value={sla} onChange={(e) => setSla(e.target.value)}>
        <option value="">Sem prazo de SLA</option>
        <option value="arte_estatica">1 dia útil</option>
        <option value="video">3 dias úteis</option>
        <option value="fotos_editadas">7 dias úteis</option>
      </Select>
      <Button type="submit" variant="primary" disabled={pending || !desc.trim() || !owner}>
        Registrar
      </Button>
    </form>
  );
}
