export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Período útil em minutos do dia, intervalo semiaberto [start, end). Ex.: 10:00–13:00 = [600, 780]. */
export interface Period {
  start: number;
  end: number;
}

export interface BusinessCalendar {
  /** IANA timezone. Ex.: "America/Sao_Paulo". */
  timezone: string;
  /** Períodos úteis por dia da semana (0 = domingo). Dia sem entrada = não útil. */
  periods: Partial<Record<Weekday, Period[]>>;
  /** Feriados no formato YYYY-MM-DD (data local do workspace). */
  holidays: string[];
}

export type SlaModel = 'business_days' | 'business_hours';

export interface SlaPolicy {
  model: SlaModel;
  /** Quantidade de dias úteis ou horas úteis. Inteiro >= 1. */
  amount: number;
  /** A1: vence no mesmo horário após N dias úteis (só para business_days). */
  rule?: 'A1_same_time';
  /** Fração do prazo total que dispara NEAR_DUE. Padrão 0.25. */
  nearDueRatio?: number;
  /** Piso absoluto em minutos úteis que dispara NEAR_DUE. Padrão 120. */
  nearDueMinMinutes?: number;
}

export type PauseKind = 'client' | 'blocked';

export interface PauseInterval {
  start: Date;
  /** Ausente = pausa em aberto. */
  end?: Date;
  kind: PauseKind;
}

export type SlaStatus = 'ON_TIME' | 'NEAR_DUE' | 'OVERDUE' | 'PAUSED' | 'BLOCKED';

export interface SlaInput {
  calendar: BusinessCalendar;
  policy: SlaPolicy;
  createdAt: Date;
  pausedIntervals?: PauseInterval[];
  now: Date;
}

export interface SlaResult {
  /** Início normalizado para o próximo instante útil. */
  startAt: Date;
  /** Vencimento. null enquanto houver pausa/bloqueio em aberto (o relógio está parado). */
  dueAt: Date | null;
  /** Prazo total em minutos úteis. */
  totalBusinessMinutes: number;
  /** Minutos úteis restantes. Negativo quando atrasado. */
  remainingBusinessMinutes: number;
  consumedBusinessMinutes: number;
  status: SlaStatus;
}
