import type { BusinessCalendar, Period, Weekday } from './types';
import { addDays, compareLocal, fromLocal, toLocal, weekday, type LocalPoint } from './time';

/** Limite de segurança para laços sobre dias (10 anos). */
const MAX_DAYS = 3660;

export const hm = (h: number, m = 0): number => h * 60 + m;

/** Expediente padrão da Agência 4P: seg–sex, 10:00–13:00 e 14:00–19:00. */
export function defaultCalendar(holidays: string[] = [], timezone = 'America/Sao_Paulo'): BusinessCalendar {
  const day: Period[] = [
    { start: hm(10), end: hm(13) },
    { start: hm(14), end: hm(19) },
  ];
  return { timezone, holidays, periods: { 1: day, 2: day, 3: day, 4: day, 5: day } };
}

export function validateCalendar(cal: BusinessCalendar): void {
  let any = false;
  for (const [wd, ps] of Object.entries(cal.periods)) {
    if (!ps) continue;
    let last = -1;
    for (const p of ps) {
      if (!(p.start >= 0 && p.end <= 1440 && p.start < p.end && p.start >= last)) {
        throw new Error(`Período inválido no dia ${wd}: ${p.start}-${p.end}`);
      }
      last = p.end;
      any = true;
    }
  }
  if (!any) throw new Error('O calendário precisa ter ao menos um período útil.');
}

export class CalendarWalker {
  private readonly holidays: Set<string>;

  constructor(private readonly cal: BusinessCalendar) {
    validateCalendar(cal);
    this.holidays = new Set(cal.holidays);
  }

  periodsOf(date: string): Period[] {
    if (this.holidays.has(date)) return [];
    return this.cal.periods[weekday(date) as Weekday] ?? [];
  }

  isBusinessDay(date: string): boolean {
    return this.periodsOf(date).length > 0;
  }

  local(instant: Date): LocalPoint {
    return toLocal(instant, this.cal.timezone);
  }

  instant(p: LocalPoint): Date {
    return fromLocal(p.date, p.minute, this.cal.timezone);
  }

  /** Próximo instante útil a partir de p (inclusive). */
  normalize(p: LocalPoint): LocalPoint {
    let date = p.date;
    let minute = p.minute;
    for (let i = 0; i < MAX_DAYS; i++) {
      for (const per of this.periodsOf(date)) {
        if (minute < per.end) return { date, minute: Math.max(minute, per.start) };
      }
      date = addDays(date, 1);
      minute = 0;
    }
    throw new Error('Nenhum período útil encontrado.');
  }

  /** N-ésimo dia útil depois de date. */
  addBusinessDays(date: string, n: number): string {
    let d = date;
    let left = n;
    for (let i = 0; i < MAX_DAYS && left > 0; i++) {
      d = addDays(d, 1);
      if (this.isBusinessDay(d)) left--;
    }
    if (left > 0) throw new Error('Nenhum dia útil encontrado.');
    return d;
  }

  /**
   * Regra A1: o horário de destino precisa estar dentro do expediente do dia.
   * Se cair numa lacuna (ex.: almoço), vence no fim do período anterior (decisão 3 da V3).
   */
  clampToPeriods(date: string, minute: number): number {
    const ps = this.periodsOf(date);
    const first = ps[0]!;
    if (minute <= first.start) return first.start;
    let prevEnd = first.start;
    for (const per of ps) {
      if (minute < per.start) return prevEnd;
      if (minute <= per.end) return minute;
      prevEnd = per.end;
    }
    return prevEnd;
  }

  /** Soma minutos úteis a partir de p. Se minutes = 0, devolve p normalizado. */
  addBusinessMinutes(p: LocalPoint, minutes: number): LocalPoint {
    let left = minutes;
    let date = p.date;
    let from = p.minute;
    if (left <= 0) return this.normalize(p);
    for (let i = 0; i < MAX_DAYS; i++) {
      for (const per of this.periodsOf(date)) {
        const s = Math.max(per.start, from);
        if (s >= per.end) continue;
        const avail = per.end - s;
        if (left <= avail) return { date, minute: s + left };
        left -= avail;
      }
      date = addDays(date, 1);
      from = 0;
    }
    throw new Error('Nenhum período útil encontrado.');
  }

  /** Minutos úteis entre a e b (0 se b <= a). */
  businessMinutesBetween(a: LocalPoint, b: LocalPoint): number {
    if (compareLocal(b, a) <= 0) return 0;
    let total = 0;
    let date = a.date;
    for (let i = 0; i < MAX_DAYS; i++) {
      const lo = date === a.date ? a.minute : 0;
      const hi = date === b.date ? b.minute : 1440;
      for (const per of this.periodsOf(date)) {
        const s = Math.max(per.start, lo);
        const e = Math.min(per.end, hi);
        if (e > s) total += e - s;
      }
      if (date === b.date) return total;
      date = addDays(date, 1);
    }
    throw new Error('Intervalo grande demais.');
  }
}
