'use client';
import { useState } from 'react';
import { money, parseMoney } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Menu, Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select } from '@/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceActions({
  id,
  number,
  balance,
  hasPayments,
}: {
  id: string;
  number: string;
  balance: number;
  hasPayments: boolean;
}) {
  const { run } = useAction();
  const [m, setM] = useState<null | 'pay' | 'cancel'>(null);
  const [amount, setAmount] = useState((balance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState('PIX');
  const [reason, setReason] = useState('');
  return (
    <>
      <Menu
        trigger={<Button size="sm">Ações</Button>}
        items={[
          { label: 'Registrar pagamento', onSelect: () => setM('pay') },
          ...(!hasPayments
            ? [{ label: 'Cancelar cobrança', onSelect: () => setM('cancel'), danger: true }]
            : []),
        ]}
      />
      <Modal
        open={m === 'pay'}
        onOpenChange={(o) => !o && setM(null)}
        title={`Pagamento · ${number}`}
        footer={
          <>
            <Button onClick={() => setM(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                let cents = 0;
                try {
                  cents = parseMoney(amount);
                } catch {
                  /* inválido */
                }
                void run(
                  () =>
                    api.finance.recordPayment.mutate({ invoiceId: id, amountCents: cents, paidOn, method }),
                  cents < balance ? 'Pagamento parcial registrado.' : 'Fatura quitada.',
                ).then((r) => r !== undefined && setM(null));
              }}
            >
              Registrar
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Saldo em aberto: <b className="num text-ink">{money(balance)}</b>. Pagamento parcial é permitido.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Valor (R$)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Data do pagamento">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Forma">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {['PIX', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
      <Modal
        open={m === 'cancel'}
        onOpenChange={(o) => !o && setM(null)}
        title={`Cancelar ${number}`}
        footer={
          <>
            <Button onClick={() => setM(null)}>Voltar</Button>
            <Button
              variant="danger"
              disabled={reason.length < 5}
              onClick={() =>
                run(() => api.finance.cancelInvoice.mutate({ id, reason }), 'Cobrança cancelada.').then(
                  (r) => r !== undefined && setM(null),
                )
              }
            >
              Cancelar cobrança
            </Button>
          </>
        }
      >
        <Field label="Motivo (auditoria)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

export function NewInvoice({ clients }: { clients: { id: string; name: string }[] }) {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ clientId: '', description: '', amount: '', dueOn: today() });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Cobrança avulsa
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Cobrança avulsa"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!v.clientId || !v.description || !v.amount}
              onClick={() =>
                run(
                  () =>
                    api.finance.createInvoice.mutate({
                      clientId: v.clientId,
                      description: v.description,
                      amountCents: parseMoney(v.amount),
                      dueOn: v.dueOn,
                    }),
                  'Cobrança criada.',
                ).then((r) => r !== undefined && setOpen(false))
              }
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
        <Field label="Descrição">
          <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)">
            <Input value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={v.dueOn} onChange={(e) => setV({ ...v, dueOn: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
