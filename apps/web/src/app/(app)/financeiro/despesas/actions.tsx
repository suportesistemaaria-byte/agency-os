'use client';
import { useState } from 'react';
import { parseMoney } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select } from '@/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

export function PayExpense({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => run(() => api.finance.payExpense.mutate({ id, paidOn: today() }), 'Despesa paga.')}
    >
      Pagar hoje
    </Button>
  );
}

export function NewExpense({ categories }: { categories: { id: string; name: string }[] }) {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    description: '',
    supplier: '',
    categoryId: '',
    amount: '',
    dueOn: today(),
    paid: '0',
    recurring: '0',
  });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Nova despesa
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Nova despesa"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!v.description || !v.amount}
              onClick={() =>
                run(
                  () =>
                    api.finance.createExpense.mutate({
                      description: v.description,
                      supplier: v.supplier || undefined,
                      categoryId: v.categoryId || undefined,
                      amountCents: parseMoney(v.amount),
                      dueOn: v.dueOn,
                      paidOn: v.paid === '1' ? v.dueOn : null,
                      recurring: v.recurring === '1' ? 'monthly' : null,
                    }),
                  'Despesa registrada.',
                ).then((r) => r !== undefined && setOpen(false))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Descrição">
          <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fornecedor">
            <Input value={v.supplier} onChange={(e) => setV({ ...v, supplier: e.target.value })} />
          </Field>
          <Field label="Categoria">
            <Select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor (R$)">
            <Input value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} />
          </Field>
          <Field label="Situação">
            <Select value={v.paid} onChange={(e) => setV({ ...v, paid: e.target.value })}>
              <option value="0">A pagar</option>
              <option value="1">Já paga</option>
            </Select>
          </Field>
          <Field label="Recorrência">
            <Select value={v.recurring} onChange={(e) => setV({ ...v, recurring: e.target.value })}>
              <option value="0">Única</option>
              <option value="1">Mensal (gera a próxima automaticamente)</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
