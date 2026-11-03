import { describe, expect, it } from 'vitest';
import { applyPayment, dueDateFor, financeSummary, mrr } from './finance-calc';

const contracts = [
  {
    status: 'active',
    startOn: '2026-11-03',
    endOn: '2027-11-02',
    items: [
      { kind: 'setup', amountCents: 1_800_000 },
      { kind: 'recurring', amountCents: 400_000 },
    ],
  },
  {
    status: 'active',
    startOn: '2026-01-10',
    endOn: '2027-01-09',
    items: [{ kind: 'recurring', amountCents: 650_000 }],
  },
  {
    status: 'pending_finance_confirmation',
    startOn: '2026-11-05',
    endOn: null,
    items: [{ kind: 'recurring', amountCents: 999_900 }],
  },
  {
    status: 'ended',
    startOn: '2025-01-01',
    endOn: '2025-12-31',
    items: [{ kind: 'recurring', amountCents: 300_000 }],
  },
];

describe('finanças: os 5 conceitos não se misturam', () => {
  const d = {
    opps: [
      { state: 'open', mrrCents: 400_000, probability: 40 },
      { state: 'open', mrrCents: 800_000, probability: 50 },
      { state: 'lost', mrrCents: 900_000, probability: 10 },
      { state: 'won', mrrCents: 650_000, probability: 100 },
    ],
    contracts,
    invoices: [
      {
        competence: '2026-11',
        amountCents: 650_000,
        paidCents: 650_000,
        status: 'paid',
        dueOn: '2026-11-10',
      },
      {
        competence: '2026-11',
        amountCents: 1_800_000,
        paidCents: 900_000,
        status: 'partially_paid',
        dueOn: '2026-11-20',
      },
      { competence: '2026-10', amountCents: 650_000, paidCents: 0, status: 'overdue', dueOn: '2026-10-10' },
      { competence: '2026-11', amountCents: 123_400, paidCents: 0, status: 'cancelled', dueOn: '2026-11-10' },
    ],
    payments: [
      { paidOn: '2026-11-09', amountCents: 650_000 },
      { paidOn: '2026-11-12', amountCents: 900_000 },
      { paidOn: '2026-10-09', amountCents: 650_000 },
    ],
    expenses: [
      { competence: '2026-11', amountCents: 89_000, dueOn: '2026-11-08', paidOn: '2026-11-08' },
      { competence: '2026-11', amountCents: 325_000, dueOn: '2026-11-10', paidOn: null },
    ],
  };
  const r = financeSummary(d, '2026-11', '2026-11-15');

  it('pipeline potencial = só oportunidades abertas, nunca receita', () => {
    expect(r.pipelineCents).toBe(1_200_000);
  });
  it('forecast = MRR × probabilidade da etapa', () => {
    expect(r.forecastCents).toBe(160_000 + 400_000);
  });
  it('contratado = recorrentes vigentes + setup que começa no período; ignora pendente e encerrado', () => {
    expect(r.contractedCents).toBe(400_000 + 1_800_000 + 650_000);
  });
  it('faturado = cobranças emitidas da competência, pagas ou não; ignora canceladas', () => {
    expect(r.invoicedCents).toBe(650_000 + 1_800_000);
  });
  it('recebido = pagamentos pela data de caixa', () => {
    expect(r.receivedCents).toBe(1_550_000);
  });
  it('MRR = soma dos itens recorrentes de contratos vigentes', () => {
    expect(r.mrrCents).toBe(1_050_000);
    expect(mrr(contracts, '2025-06')).toBe(0);
  });
  it('a receber e atrasado usam o saldo aberto', () => {
    expect(r.receivableCents).toBe(900_000 + 650_000);
    expect(r.overdueCents).toBe(650_000);
  });
  it('nenhum conceito é a soma de outro', () => {
    const vals = [r.pipelineCents, r.forecastCents, r.contractedCents, r.invoicedCents, r.receivedCents];
    expect(new Set(vals).size).toBe(5);
  });
});

describe('pagamento parcial', () => {
  const inv = { amountCents: 100_000, paidCents: 0, status: 'issued', dueOn: '2026-11-20' };
  it('parcial mantém saldo e status partially_paid', () => {
    expect(applyPayment(inv, 40_000, '2026-11-10')).toEqual({ paidCents: 40_000, status: 'partially_paid' });
  });
  it('quitação vira paid', () => {
    expect(applyPayment({ ...inv, paidCents: 40_000 }, 60_000, '2026-11-10')).toEqual({
      paidCents: 100_000,
      status: 'paid',
    });
  });
  it('parcial após vencimento continua atrasada', () => {
    expect(applyPayment(inv, 10_000, '2026-11-25').status).toBe('overdue');
  });
  it('não aceita pagamento acima do saldo nem valor zero/negativo', () => {
    expect(() => applyPayment({ ...inv, paidCents: 90_000 }, 20_000, '2026-11-10')).toThrow();
    expect(() => applyPayment(inv, 0, '2026-11-10')).toThrow();
    expect(() => applyPayment(inv, -5, '2026-11-10')).toThrow();
  });
  it('vencimento limitado ao último dia do mês', () => {
    expect(dueDateFor('2026-02', 31)).toBe('2026-02-28');
    expect(dueDateFor('2026-11', 10)).toBe('2026-11-10');
  });
});
