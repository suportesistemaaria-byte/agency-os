'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/trpc';
import { Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select } from '@/components/ui';

export function NewCampaign({ clients }: { clients: { id: string; name: string }[] }) {
  const { run } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ clientId: '', name: '', objective: '', startsOn: '', endsOn: '' });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Nova campanha
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Nova campanha"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!v.clientId || !v.name}
              onClick={async () => {
                const r = await run(
                  () =>
                    api.campaigns.create.mutate({
                      clientId: v.clientId,
                      name: v.name,
                      objective: v.objective || undefined,
                      startsOn: v.startsOn || undefined,
                      endsOn: v.endsOn || undefined,
                    }),
                  'Campanha criada.',
                  { refresh: false },
                );
                if (r) router.push(`/campanhas/${r.id}`);
              }}
            >
              Criar
            </Button>
          </>
        }
      >
        <Field label="Cliente">
          <Select value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })}>
            <option value="">Selecione…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome">
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="Black Friday"
          />
        </Field>
        <Field label="Objetivo">
          <Input
            value={v.objective}
            onChange={(e) => setV({ ...v, objective: e.target.value })}
            placeholder="Conversão, alcance…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <Input
              type="date"
              value={v.startsOn}
              onChange={(e) => setV({ ...v, startsOn: e.target.value })}
            />
          </Field>
          <Field label="Fim">
            <Input type="date" value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function AssignContents({
  campaignId,
  candidates,
}: {
  campaignId: string;
  candidates: { id: string; title: string }[];
}) {
  const { run } = useAction();
  const [sel, setSel] = useState('');
  if (!candidates.length) return null;
  return (
    <div className="flex gap-2">
      <Select className="w-72" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Adicionar conteúdo do cliente…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </Select>
      <Button
        disabled={!sel}
        onClick={() =>
          run(
            () => api.campaigns.assignContent.mutate({ contentId: sel, campaignId }),
            'Conteúdo adicionado à campanha.',
          ).then(() => setSel(''))
        }
      >
        Adicionar
      </Button>
    </div>
  );
}
