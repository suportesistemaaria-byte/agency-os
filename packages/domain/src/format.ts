/** Formatação pt-BR compartilhada (servidor e navegador). Sem dependências. */
const TZ = 'America/Sao_Paulo';

export const money = (cents: number | null | undefined, opts: { compact?: boolean } = {}) =>
  cents === null || cents === undefined
    ? '—'
    : (cents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: opts.compact || cents % 100 === 0 ? 0 : 2,
        minimumFractionDigits: opts.compact || cents % 100 === 0 ? 0 : 2,
      });

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...o });
const asDate = (d: Date | string) =>
  typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00-03:00` : d) : d;

export const dateShort = (d: Date | string | null | undefined) =>
  d ? fmt({ day: '2-digit', month: '2-digit' }).format(asDate(d)) : '—';
export const dateLong = (d: Date | string | null | undefined) =>
  d ? fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(asDate(d)) : '—';
export const dateFull = (d: Date | string | null | undefined) =>
  d ? fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(asDate(d)) : '—';
export const time = (d: Date | string | null | undefined) =>
  d ? fmt({ hour: '2-digit', minute: '2-digit' }).format(asDate(d)) : '—';
export const dateTime = (d: Date | string | null | undefined) =>
  d
    ? `${fmt({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(asDate(d)).replace('.', '')} ${time(d)}`
    : '—';

/** "1h20" a partir de minutos úteis. */
export const minutes = (m: number) => {
  const a = Math.abs(Math.round(m));
  const h = Math.floor(a / 60);
  const mm = a % 60;
  return h ? `${h}h${mm ? String(mm).padStart(2, '0') : ''}` : `${mm}min`;
};

export const relative = (d: Date | string | null | undefined, now = new Date()) => {
  if (!d) return '—';
  const diff = (asDate(d).getTime() - now.getTime()) / 60000;
  const a = Math.abs(diff);
  const s = a < 60 ? `${Math.round(a)}min` : a < 1440 ? `${Math.round(a / 60)}h` : `${Math.round(a / 1440)}d`;
  return diff < 0 ? `há ${s}` : `em ${s}`;
};

export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Converte "1.234,56" ou "1234.56" em centavos. */
export const parseMoney = (v: string): number => {
  const clean = v.replace(/[^\d,.-]/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error('Valor inválido');
  return Math.round(n * 100);
};
