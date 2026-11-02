/** Conversões entre instantes (UTC) e hora local do calendário, sem dependências externas. */

export interface LocalPoint {
  /** YYYY-MM-DD */
  date: string;
  /** minutos desde 00:00 local */
  minute: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(
  instant: Date,
  tz: string,
): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year!, m: out.month!, d: out.day!, h: out.hour! % 24, mi: out.minute!, s: out.second! };
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function toLocal(instant: Date, tz: string): LocalPoint {
  const p = parts(instant, tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, minute: p.h * 60 + p.mi + p.s / 60 };
}

function offsetMs(instant: number, tz: string): number {
  const p = parts(new Date(instant), tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function fromLocal(date: string, minute: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0) + Math.round(minute * 60_000);
  let ts = guess - offsetMs(guess, tz);
  const corrected = guess - offsetMs(ts, tz);
  if (corrected !== ts) ts = corrected;
  return new Date(ts);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function compareLocal(a: LocalPoint, b: LocalPoint): number {
  return a.date === b.date ? a.minute - b.minute : a.date < b.date ? -1 : 1;
}
