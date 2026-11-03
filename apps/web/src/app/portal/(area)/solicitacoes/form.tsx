'use client';
import { useState } from 'react';
import { REQUEST_TYPE_LABEL } from '@aos/domain/labels';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

export function NewPortalRequest() {
  const { run, pending } = useAction();
  const [v, setV] = useState({ type: 'arte_estatica', title: '', description: '', urgent: false });
  return (
    <form
      className="space-y-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api.portal.createRequest.mutate({
              type: v.type as 'arte_estatica',
              title: v.title,
              description: v.description || undefined,
              urgent: v.urgent,
            }),
          'Solicitação enviada. A agência faz a triagem em até 2 horas úteis.',
        ).then((r) => r && setV({ type: 'arte_estatica', title: '', description: '', urgent: false }));
      }}
    >
      <div className="font-semibold">Nova solicitação</div>
      <Field label="O que você precisa?">
        <Input
          required
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          placeholder="Ex.: Arte do cardápio de Natal"
        />
      </Field>
      <Field label="Tipo">
        <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          {Object.entries(REQUEST_TYPE_LABEL)
            .filter(([k]) => k !== 'alteracao')
            .map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Detalhes">
        <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#1a1a18]"
          checked={v.urgent}
          onChange={(e) => setV({ ...v, urgent: e.target.checked })}
        />{' '}
        É urgente
      </label>
      <Button type="submit" variant="primary" className="w-full" disabled={pending || !v.title.trim()}>
        Enviar solicitação
      </Button>
    </form>
  );
}
