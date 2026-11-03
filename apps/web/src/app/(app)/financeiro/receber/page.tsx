import { listClientsBasic, listInvoices, listReceipts } from '@aos/domain';
import { INVOICE_STATUS_LABEL } from '@aos/domain/labels';
import { dateFull, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Chips, PageHeader, Pill, Stats, Table } from '@/components/ui';
import { InvoiceActions, NewInvoice } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const ctx = await requirePerm('financeiro.view');
  const st = (await searchParams).s ?? 'open';
  const all = await listInvoices(ctx);
  const clients = await listClientsBasic(ctx);
  const rows = all.filter((i) =>
    st === 'open'
      ? ['issued', 'partially_paid', 'overdue'].includes(i.status)
      : st === 'all'
        ? true
        : i.status === st,
  );
  const open = all.filter((i) => ['issued', 'partially_paid', 'overdue'].includes(i.status));
  const canEdit = ctx.perms.has('financeiro.edit');
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Receitas · a receber"
        subtitle="Cobranças por competência; pagamento parcial permitido, nunca acima do saldo."
        actions={canEdit && <NewInvoice clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
      />
      <Stats
        items={[
          {
            label: 'A receber',
            value: money(open.reduce((a, i) => a + i.amountCents - i.paidCents, 0)),
            tone: 'warn',
            hint: `${open.length} cobranças`,
          },
          {
            label: 'Atrasado',
            value: money(
              all.filter((i) => i.status === 'overdue').reduce((a, i) => a + i.amountCents - i.paidCents, 0),
            ),
            tone: 'bad',
            hint: `${all.filter((i) => i.status === 'overdue').length} cobranças`,
          },
          { label: 'Parcialmente pagas', value: all.filter((i) => i.status === 'partially_paid').length },
        ]}
      />
      <div className="mb-4">
        <Chips
          active={st}
          items={[
            { key: 'open', label: 'Em aberto', href: '?s=open' },
            { key: 'overdue', label: 'Atrasadas', href: '?s=overdue' },
            { key: 'paid', label: 'Pagas', href: '?s=paid' },
            { key: 'all', label: 'Todas', href: '?s=all' },
            { key: 'receipts', label: 'Recebimentos', href: '?s=receipts' },
          ]}
        />
      </div>
      {st === 'receipts' ? (
        <Table head={['Data', 'Cliente', 'Fatura', 'Descrição', 'Forma', 'Valor']}>
          {(await listReceipts(ctx)).map((r) => (
            <tr key={r.p.id}>
              <td>{dateFull(r.p.paidOn)}</td>
              <td className="font-medium">{r.client}</td>
              <td className="font-mono">{r.number}</td>
              <td className="text-muted">{r.description}</td>
              <td>{r.p.method ?? '—'}</td>
              <td className="num font-medium text-ok">{money(r.p.amountCents)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table
          head={[
            'Fatura',
            'Cliente',
            'Descrição',
            'Competência',
            'Vencimento',
            'Valor',
            'Pago',
            'Saldo',
            'Status',
            '',
          ]}
        >
          {rows.map((i) => (
            <tr key={i.id} className="hover:bg-side">
              <td className="font-mono">{i.number}</td>
              <td className="font-medium">{i.clientName}</td>
              <td className="text-muted">{i.description}</td>
              <td className="font-mono">{i.competence}</td>
              <td>{dateFull(i.dueOn)}</td>
              <td className="num">{money(i.amountCents)}</td>
              <td className="num">{money(i.paidCents)}</td>
              <td className="num font-medium">{money(i.amountCents - i.paidCents)}</td>
              <td>
                <Pill
                  tone={
                    i.status === 'paid'
                      ? 'ok'
                      : i.status === 'overdue'
                        ? 'bad'
                        : i.status === 'cancelled'
                          ? 'neutral'
                          : 'warn'
                  }
                >
                  {INVOICE_STATUS_LABEL[i.status]}
                </Pill>
              </td>
              <td>
                {canEdit && i.status !== 'paid' && i.status !== 'cancelled' && (
                  <InvoiceActions
                    id={i.id}
                    number={i.number}
                    balance={i.amountCents - i.paidCents}
                    hasPayments={i.paidCents > 0}
                  />
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
