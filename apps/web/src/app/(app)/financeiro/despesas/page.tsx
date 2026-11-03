import { listExpenseCategories, listExpenses } from '@aos/domain';
import { dateFull, money } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { PageHeader, Pill, Stats, Table } from '@/components/ui';
import { NewExpense, PayExpense } from './actions';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const ctx = await requirePerm('financeiro.view');
  const [rows, cats] = await Promise.all([listExpenses(ctx), listExpenseCategories(ctx)]);
  const month = new Date().toISOString().slice(0, 7);
  const cur = rows.filter((r) => r.e.competence === month);
  const open = rows.filter((r) => !r.e.paidOn);
  const canEdit = ctx.perms.has('financeiro.edit');
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Despesas · a pagar"
        subtitle="Despesa em aberto é conta a pagar; ao pagar, entra no caixa pela data do pagamento."
        actions={canEdit && <NewExpense categories={cats.map((c) => ({ id: c.id, name: c.name }))} />}
      />
      <Stats
        items={[
          {
            label: 'Despesas do mês',
            value: money(cur.reduce((a, r) => a + r.e.amountCents, 0)),
            hint: `${Math.round(
              (cur.filter((r) => r.kind === 'fixed').reduce((a, r) => a + r.e.amountCents, 0) /
                Math.max(
                  1,
                  cur.reduce((a, r) => a + r.e.amountCents, 0),
                )) *
                100,
            )}% fixas`,
          },
          {
            label: 'A pagar',
            value: money(open.reduce((a, r) => a + r.e.amountCents, 0)),
            tone: 'warn',
            hint: `${open.length} contas`,
          },
          {
            label: 'Vencidas',
            value: open.filter((r) => r.e.dueOn < today).length,
            tone: open.some((r) => r.e.dueOn < today) ? 'bad' : 'neutral',
          },
        ]}
      />
      <Table
        head={['Descrição', 'Fornecedor', 'Categoria', 'Competência', 'Vencimento', 'Valor', 'Status', '']}
      >
        {[...open, ...rows.filter((r) => r.e.paidOn).reverse()].map(({ e, category, kind }) => (
          <tr key={e.id} className="hover:bg-side">
            <td className="font-medium">{e.description}</td>
            <td>{e.supplier ?? '—'}</td>
            <td>
              {category ?? '—'}{' '}
              <span className="text-faint">{kind === 'fixed' ? '· fixa' : kind ? '· variável' : ''}</span>
            </td>
            <td className="font-mono">{e.competence}</td>
            <td>{dateFull(e.dueOn)}</td>
            <td className="num">{money(e.amountCents)}</td>
            <td>
              {e.paidOn ? (
                <Pill tone="ok">Pago {dateFull(e.paidOn)}</Pill>
              ) : e.dueOn < today ? (
                <Pill tone="bad">Vencida</Pill>
              ) : (
                <Pill tone="warn">A pagar</Pill>
              )}
            </td>
            <td>{canEdit && !e.paidOn && <PayExpense id={e.id} />}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
