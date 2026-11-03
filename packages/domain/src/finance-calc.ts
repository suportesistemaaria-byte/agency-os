/**
 * Os 5 conceitos financeiros da V3 (seção 14), que NUNCA se somam entre si. Funções puras.
 * Pipeline potencial · Forecast · Contratado · Faturado · Recebido.
 */
export interface OppIn {
  state: string;
  mrrCents: number;
  probability: number;
}
export interface ContractIn {
  status: string;
  startOn: string;
  endOn: string | null;
  items: { kind: string; amountCents: number }[];
}
export interface InvoiceIn {
  competence: string;
  amountCents: number;
  paidCents: number;
  status: string;
  dueOn: string;
}
export interface PaymentIn {
  paidOn: string;
  amountCents: number;
}
export interface ExpenseIn {
  competence: string;
  amountCents: number;
  dueOn: string;
  paidOn: string | null;
}

const monthStart = (p: string) => `${p}-01`;
const monthEnd = (p: string) => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const inMonth = (date: string, p: string) => date.slice(0, 7) === p;

export function contractActiveIn(c: ContractIn, period: string): boolean {
  return (
    c.status === 'active' && c.startOn <= monthEnd(period) && (!c.endOn || c.endOn >= monthStart(period))
  );
}

/** MRR = Σ itens recorrentes de contratos vigentes, normalizados por mês. */
export function mrr(contracts: ContractIn[], period: string): number {
  return contracts
    .filter((c) => contractActiveIn(c, period))
    .reduce(
      (a, c) => a + c.items.filter((i) => i.kind === 'recurring').reduce((x, i) => x + i.amountCents, 0),
      0,
    );
}

export function financeSummary(
  d: {
    opps: OppIn[];
    contracts: ContractIn[];
    invoices: InvoiceIn[];
    payments: PaymentIn[];
    expenses: ExpenseIn[];
  },
  period: string,
  today: string,
) {
  const open = d.opps.filter((o) => o.state === 'open');
  const pipeline = open.reduce((a, o) => a + o.mrrCents, 0);
  const forecast = Math.round(open.reduce((a, o) => a + (o.mrrCents * o.probability) / 100, 0));
  const contracted = d.contracts
    .filter((c) => contractActiveIn(c, period))
    .reduce(
      (a, c) =>
        a +
        c.items
          .filter((i) => i.kind === 'recurring' || (i.kind === 'setup' && inMonth(c.startOn, period)))
          .reduce((x, i) => x + i.amountCents, 0),
      0,
    );
  const valid = d.invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft');
  const invoiced = valid.filter((i) => i.competence === period).reduce((a, i) => a + i.amountCents, 0);
  const received = d.payments.filter((p) => inMonth(p.paidOn, period)).reduce((a, p) => a + p.amountCents, 0);
  const open_ = valid.filter((i) => i.paidCents < i.amountCents);
  const receivable = open_.reduce((a, i) => a + i.amountCents - i.paidCents, 0);
  const overdue = open_.filter((i) => i.dueOn < today).reduce((a, i) => a + i.amountCents - i.paidCents, 0);
  const expenses = d.expenses.filter((e) => e.competence === period).reduce((a, e) => a + e.amountCents, 0);
  const paidExpenses = d.expenses
    .filter((e) => e.paidOn && inMonth(e.paidOn, period))
    .reduce((a, e) => a + e.amountCents, 0);
  const payable = d.expenses.filter((e) => !e.paidOn).reduce((a, e) => a + e.amountCents, 0);
  return {
    pipelineCents: pipeline,
    forecastCents: forecast,
    contractedCents: contracted,
    invoicedCents: invoiced,
    receivedCents: received,
    mrrCents: mrr(d.contracts, period),
    receivableCents: receivable,
    overdueCents: overdue,
    expensesCents: expenses,
    paidExpensesCents: paidExpenses,
    payableCents: payable,
    cashBalanceCents: received - paidExpenses,
  };
}

/** Novo estado da fatura após um pagamento (pagamento parcial permitido; nunca acima do total). */
export function applyPayment(
  inv: { amountCents: number; paidCents: number; status: string; dueOn: string },
  amount: number,
  today: string,
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor do pagamento precisa ser positivo.');
  if (inv.status === 'cancelled') throw new Error('Fatura cancelada.');
  const paid = inv.paidCents + amount;
  if (paid > inv.amountCents) throw new Error('Pagamento acima do saldo da fatura.');
  const status = paid === inv.amountCents ? 'paid' : inv.dueOn < today ? 'overdue' : 'partially_paid';
  return { paidCents: paid, status };
}

/** Data de vencimento de uma competência pelo dia de cobrança do contrato (limitada ao último dia do mês). */
export function dueDateFor(competence: string, billingDay: number): string {
  const last = Number(monthEnd(competence).slice(8, 10));
  return `${competence}-${String(Math.min(billingDay, last)).padStart(2, '0')}`;
}
