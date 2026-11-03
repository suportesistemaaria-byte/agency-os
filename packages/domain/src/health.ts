/** Health score com fatores (V3): o score sempre explica o porquê. Função pura. */
export interface HealthInput {
  overdueInvoices: number;
  overdueInvoiceDays: number;
  overdueTasks: number;
  waitingApprovals: number;
  changeRequests30d: number;
  renewalDays: number | null;
  onboarding: boolean;
}
export interface HealthFactor {
  key: string;
  label: string;
  points: number;
}

export function computeHealth(i: HealthInput): {
  score: number | null;
  factors: HealthFactor[];
  band: 'healthy' | 'attention' | 'critical' | 'onboarding';
} {
  if (i.onboarding)
    return {
      score: null,
      factors: [{ key: 'onboarding', label: 'Em onboarding', points: 0 }],
      band: 'onboarding',
    };
  const f: HealthFactor[] = [];
  if (i.overdueInvoices > 0)
    f.push({
      key: 'finance',
      label: `${i.overdueInvoices} cobrança(s) em atraso (${i.overdueInvoiceDays} dias)`,
      points: -Math.min(40, 20 + i.overdueInvoiceDays),
    });
  if (i.overdueTasks > 0)
    f.push({
      key: 'tasks',
      label: `${i.overdueTasks} tarefa(s) atrasada(s)`,
      points: -Math.min(20, i.overdueTasks * 5),
    });
  if (i.waitingApprovals >= 3)
    f.push({ key: 'approvals', label: `${i.waitingApprovals} aprovações paradas no cliente`, points: -10 });
  if (i.changeRequests30d >= 3)
    f.push({
      key: 'changes',
      label: `${i.changeRequests30d} alterações em 30 dias`,
      points: -Math.min(15, i.changeRequests30d * 3),
    });
  if (i.renewalDays !== null && i.renewalDays <= 30)
    f.push({ key: 'renewal', label: `Renovação em ${i.renewalDays} dias`, points: -10 });
  const score = Math.max(0, Math.min(100, 100 + f.reduce((a, x) => a + x.points, 0)));
  return { score, factors: f, band: score >= 75 ? 'healthy' : score >= 50 ? 'attention' : 'critical' };
}
