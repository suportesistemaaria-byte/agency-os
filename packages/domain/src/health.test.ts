import { describe, expect, it } from 'vitest';
import { computeHealth } from './health';

const base = {
  overdueInvoices: 0,
  overdueInvoiceDays: 0,
  overdueTasks: 0,
  waitingApprovals: 0,
  changeRequests30d: 0,
  renewalDays: 200,
  onboarding: false,
};

describe('health score', () => {
  it('cliente sem problemas = 100 e saudável', () => {
    expect(computeHealth(base)).toMatchObject({ score: 100, band: 'healthy', factors: [] });
  });
  it('cada ponto perdido tem um fator explicando', () => {
    const r = computeHealth({
      ...base,
      overdueInvoices: 2,
      overdueInvoiceDays: 16,
      overdueTasks: 1,
      renewalDays: 20,
    });
    expect(r.score).toBe(100 - 36 - 5 - 10);
    expect(r.factors.map((f) => f.key)).toEqual(['finance', 'tasks', 'renewal']);
    expect(r.factors.reduce((a, f) => a + f.points, 0)).toBe((r.score ?? 0) - 100);
    expect(r.band).toBe('critical');
  });
  it('onboarding não tem score', () => {
    expect(computeHealth({ ...base, onboarding: true }).score).toBeNull();
  });
  it('score nunca fica negativo', () => {
    expect(
      computeHealth({
        ...base,
        overdueInvoices: 9,
        overdueInvoiceDays: 90,
        overdueTasks: 30,
        waitingApprovals: 9,
        changeRequests30d: 20,
        renewalDays: 1,
      }).score,
    ).toBe(5);
  });
});
