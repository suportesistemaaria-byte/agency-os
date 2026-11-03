'use client';
import { useState } from 'react';
import { api } from '@/lib/trpc';
import { Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select } from '@/components/ui';

export function PolicyAmount({
  id,
  amount,
  unit,
  can,
}: {
  id: string;
  amount: number;
  unit: string;
  can: boolean;
}) {
  const { run } = useAction();
  const [v, setV] = useState(String(amount));
  if (!can)
    return (
      <span className="num">
        {amount} {unit}
      </span>
    );
  return (
    <span className="flex items-center gap-2">
      <Input
        className="h-7 w-16"
        type="number"
        min={1}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() =>
          Number(v) !== amount &&
          run(() => api.settings.updatePolicy.mutate({ id, amount: Number(v) }), 'Política atualizada.')
        }
      />
      <span className="text-muted">{unit}</span>
    </span>
  );
}

export function HolidayForm() {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<{
    date: string;
    name: string;
    kind: 'national' | 'state' | 'municipal' | 'recess';
  }>({ date: '', name: '', kind: 'municipal' });
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Adicionar feriado
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Novo feriado"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                run(
                  () => api.settings.addHoliday.mutate(v),
                  'Feriado adicionado; novos prazos já consideram a data.',
                ).then((r) => r !== undefined && setOpen(false))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Data">
          <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label="Nome">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}>
            <option value="national">Nacional</option>
            <option value="state">Estadual</option>
            <option value="municipal">Municipal</option>
            <option value="recess">Recesso</option>
          </Select>
        </Field>
      </Modal>
    </>
  );
}

export function RemoveHoliday({ id }: { id: string }) {
  const { run } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => run(() => api.settings.removeHoliday.mutate({ id }), 'Feriado removido.')}
    >
      Remover
    </Button>
  );
}
