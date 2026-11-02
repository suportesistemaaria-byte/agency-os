import { CalendarWalker } from './calendar';
import { compareLocal, type LocalPoint } from './time';
import type { PauseInterval, SlaInput, SlaResult, SlaStatus } from './types';

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Único ponto do sistema que calcula prazos de SLA.
 * Função pura: não acessa banco, relógio do sistema nem variáveis globais.
 */
export function calculateDueAt(input: SlaInput): SlaResult {
  const { calendar, policy, createdAt, now } = input;
  if (!Number.isInteger(policy.amount) || policy.amount < 1) {
    throw new Error('policy.amount precisa ser inteiro >= 1');
  }
  const w = new CalendarWalker(calendar);
  const start = w.normalize(w.local(createdAt));

  // 1. Vencimento sem pausas.
  let due: LocalPoint;
  if (policy.model === 'business_days') {
    const date = w.addBusinessDays(start.date, policy.amount);
    due = { date, minute: w.clampToPeriods(date, start.minute) };
  } else {
    due = w.addBusinessMinutes(start, policy.amount * 60);
  }
  const total = w.businessMinutesBetween(start, due);

  // 2. Aplica pausas: o saldo em minutos úteis volta a correr a partir da retomada (decisão 2 da V3).
  const pauses: PauseInterval[] = [...(input.pausedIntervals ?? [])].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const nowL = w.local(now);
  let cursor = start;
  let remaining = total;
  let openPause: PauseInterval | null = null;

  for (const p of pauses) {
    const ps = w.local(p.start);
    if (compareLocal(ps, due) >= 0) break; // pausa depois do vencimento não altera o prazo
    const pe = p.end && p.end.getTime() <= now.getTime() ? w.local(p.end) : null;
    if (compareLocal(ps, cursor) > 0) remaining -= w.businessMinutesBetween(cursor, ps);
    if (!pe) {
      if (p.start.getTime() <= now.getTime()) openPause = p;
      break;
    }
    if (compareLocal(pe, cursor) > 0) cursor = pe;
    due = w.addBusinessMinutes(w.normalize(cursor), remaining);
  }

  const result = (dueAt: Date | null, rem: number, status: SlaStatus): SlaResult => ({
    startAt: w.instant(start),
    dueAt,
    totalBusinessMinutes: round(total),
    remainingBusinessMinutes: round(rem),
    consumedBusinessMinutes: round(total - rem),
    status,
  });

  if (openPause) {
    return result(null, remaining, openPause.kind === 'blocked' ? 'BLOCKED' : 'PAUSED');
  }

  const dueAt = w.instant(due);
  if (now.getTime() > dueAt.getTime()) {
    return result(dueAt, -w.businessMinutesBetween(due, nowL), 'OVERDUE');
  }
  const rem = compareLocal(nowL, start) <= 0 ? total : w.businessMinutesBetween(nowL, due);
  const ratio = policy.nearDueRatio ?? 0.25;
  const floor = policy.nearDueMinMinutes ?? 120;
  const threshold = Math.max(total * ratio, floor);
  return result(dueAt, rem, rem <= threshold ? 'NEAR_DUE' : 'ON_TIME');
}
