import { describe, expect, it } from 'vitest';
import { calculateDueAt, defaultCalendar, DEFAULT_POLICIES as P, hm } from './index';
import type { BusinessCalendar, PauseInterval, SlaPolicy } from './types';

// America/Sao_Paulo = UTC-3 (sem horário de verão desde 2019).
const sp = (s: string): Date => new Date(s + ':00-03:00');
const iso = (d: Date | null): string | null =>
  d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : null;

const CAL = defaultCalendar(['2026-11-02', '2026-11-20', '2026-12-25']);
const run = (policy: SlaPolicy, created: string, now = created, pauses: PauseInterval[] = [], cal: BusinessCalendar = CAL) =>
  calculateDueAt({ calendar: cal, policy, createdAt: sp(created), now: sp(now), pausedIntervals: pauses });

describe('dias úteis · regra A1 (mesmo horário)', () => {
  it('dentro do expediente: ter 11:20 + 1 DU = qua 11:20 (exemplo aprovado)', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20');
    expect(iso(r.dueAt)).toBe('2026-11-11 11:20');
    expect(r.totalBusinessMinutes).toBe(480);
    expect(r.status).toBe('ON_TIME');
  });
  it('fora do expediente (noite): ter 21:00 → início qua 10:00 → qui 10:00', () => {
    const r = run(P.arte_estatica, '2026-11-10T21:00');
    expect(iso(r.startAt)).toBe('2026-11-11 10:00');
    expect(iso(r.dueAt)).toBe('2026-11-12 10:00');
  });
  it('fora do expediente (madrugada): qua 07:00 → início qua 10:00 → qui 10:00', () => {
    const r = run(P.arte_estatica, '2026-11-11T07:00');
    expect(iso(r.startAt)).toBe('2026-11-11 10:00');
    expect(iso(r.dueAt)).toBe('2026-11-12 10:00');
  });
  it('horário de almoço: ter 13:30 → início 14:00 → qua 14:00', () => {
    const r = run(P.alteracao, '2026-11-10T13:30');
    expect(iso(r.startAt)).toBe('2026-11-10 14:00');
    expect(iso(r.dueAt)).toBe('2026-11-11 14:00');
  });
  it('exatamente 13:00 conta como almoço (período semiaberto)', () => {
    expect(iso(run(P.alteracao, '2026-11-10T13:00').startAt)).toBe('2026-11-10 14:00');
  });
  it('exatamente 19:00 começa no próximo dia útil', () => {
    expect(iso(run(P.alteracao, '2026-11-10T19:00').startAt)).toBe('2026-11-11 10:00');
  });
  it('sexta-feira 18:30 + 1 DU = segunda 18:30', () => {
    expect(iso(run(P.arte_estatica, '2026-11-13T18:30').dueAt)).toBe('2026-11-16 18:30');
  });
  it('sexta-feira após 19:00 → início segunda 10:00 → terça 10:00', () => {
    const r = run(P.arte_estatica, '2026-11-13T19:30');
    expect(iso(r.startAt)).toBe('2026-11-16 10:00');
    expect(iso(r.dueAt)).toBe('2026-11-17 10:00');
  });
  it('fim de semana: impresso (3 DU) sábado 10:00 → início seg 10:00 → qui 10:00', () => {
    const r = run(P.arte_impresso, '2026-11-14T10:00');
    expect(iso(r.startAt)).toBe('2026-11-16 10:00');
    expect(iso(r.dueAt)).toBe('2026-11-19 10:00');
  });
  it('feriado no meio: vídeo (3 DU) qui 19/11 10:00 pula 20/11 → qua 25/11 10:00', () => {
    expect(iso(run(P.video, '2026-11-19T10:00').dueAt)).toBe('2026-11-25 10:00');
  });
  it('solicitação no feriado: seg 02/11 (Finados) → início ter 03/11 10:00', () => {
    const r = run(P.arte_estatica, '2026-11-02T10:00');
    expect(iso(r.startAt)).toBe('2026-11-03 10:00');
    expect(iso(r.dueAt)).toBe('2026-11-04 10:00');
  });
  it('3 dias úteis sem feriado: ter 11:00 → sex 11:00', () => {
    expect(iso(run(P.arte_impresso, '2026-11-10T11:00').dueAt)).toBe('2026-11-13 11:00');
  });
  it('7 dias úteis (fotos editadas): ter 03/11 11:00 → qui 12/11 11:00', () => {
    expect(iso(run(P.fotos_editadas, '2026-11-03T11:00').dueAt)).toBe('2026-11-12 11:00');
  });
  it('20 dias úteis (cardápio): seg 02/11 10:00 (feriado) → qua 02/12 10:00', () => {
    const r = run(P.cardapio_catalogo, '2026-11-02T10:00');
    expect(iso(r.dueAt)).toBe('2026-12-02 10:00');
    expect(r.totalBusinessMinutes).toBe(20 * 480);
  });
  it('A1 cai em lacuna do dia de destino → vence no fim do período anterior (13:00)', () => {
    const cal: BusinessCalendar = {
      ...CAL,
      periods: { ...CAL.periods, 3: [{ start: hm(10), end: hm(13) }, { start: hm(15), end: hm(19) }] },
    };
    expect(iso(run(P.alteracao, '2026-11-10T14:30', '2026-11-10T14:30', [], cal).dueAt)).toBe('2026-11-11 13:00');
  });
});

describe('horas úteis', () => {
  it('4 HU ter 12:00 → ter 17:00 (1h até 13:00 + 3h a partir das 14:00)', () => {
    expect(iso(run(P.alteracao_urgente, '2026-11-10T12:00').dueAt)).toBe('2026-11-10 17:00');
  });
  it('4 HU ter 17:30 → qua 12:30', () => {
    expect(iso(run(P.alteracao_urgente, '2026-11-10T17:30').dueAt)).toBe('2026-11-11 12:30');
  });
  it('4 HU sex 17:00 → seg 12:00', () => {
    expect(iso(run(P.alteracao_urgente, '2026-11-13T17:00').dueAt)).toBe('2026-11-16 12:00');
  });
  it('2 HU (triagem) ter 22:00 → qua 12:00', () => {
    expect(iso(run(P.triagem, '2026-11-10T22:00').dueAt)).toBe('2026-11-11 12:00');
  });
  it('4 HU terminando exatamente às 13:00 vence às 13:00 (não às 14:00)', () => {
    expect(iso(run(P.alteracao_urgente, '2026-11-10T09:00').dueAt)).toBe('2026-11-10 15:00');
    expect(iso(run({ model: 'business_hours', amount: 3 }, '2026-11-10T10:00').dueAt)).toBe('2026-11-10 13:00');
  });
});

describe('pausa, retomada e bloqueio', () => {
  const pause = (s: string, e?: string, kind: 'client' | 'blocked' = 'client'): PauseInterval => ({
    start: sp(s), end: e ? sp(e) : undefined, kind,
  });

  it('exemplo V3: ter 11:20, pausa ter 15:00 → qua 10:30 ⇒ restam 5h20 ⇒ qua 16:50', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T10:30', [pause('2026-11-10T15:00', '2026-11-11T10:30')]);
    expect(iso(r.dueAt)).toBe('2026-11-11 16:50');
    expect(r.remainingBusinessMinutes).toBe(320);
    expect(r.consumedBusinessMinutes).toBe(160);
  });
  it('pausa em aberto: status PAUSED, relógio parado, sem vencimento', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-12T18:00', [pause('2026-11-10T15:00')]);
    expect(r.status).toBe('PAUSED');
    expect(r.dueAt).toBeNull();
    expect(r.remainingBusinessMinutes).toBe(320);
  });
  it('bloqueio em aberto: status BLOCKED', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T12:00', [pause('2026-11-10T15:00', undefined, 'blocked')]);
    expect(r.status).toBe('BLOCKED');
    expect(r.dueAt).toBeNull();
  });
  it('retomada: depois do bloqueio, o saldo volta a correr', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T15:00', [pause('2026-11-10T15:00', '2026-11-11T10:30', 'blocked')]);
    expect(iso(r.dueAt)).toBe('2026-11-11 16:50');
    expect(r.remainingBusinessMinutes).toBe(110);
    expect(r.status).toBe('NEAR_DUE');
  });
  it('pausa totalmente fora do expediente não muda o vencimento', () => {
    const r = run(P.arte_estatica, '2026-11-13T18:30', '2026-11-16T10:00', [pause('2026-11-13T20:00', '2026-11-16T10:00')]);
    expect(iso(r.dueAt)).toBe('2026-11-16 18:30');
  });
  it('duas pausas somam corretamente', () => {
    const r = run(P.arte_impresso, '2026-11-10T10:00', '2026-11-16T10:00', [
      pause('2026-11-10T12:00', '2026-11-10T16:00'),
      pause('2026-11-11T10:00', '2026-11-11T14:00', 'blocked'),
    ]);
    // total 1440; consumidos 120 (ter 10–12) + 180 (ter 16–19) = 300; retoma qua 14:00 com 1140 → sex 17:00
    expect(r.totalBusinessMinutes).toBe(1440);
    expect(iso(r.dueAt)).toBe('2026-11-13 17:00');
    expect(r.status).toBe('OVERDUE');
  });
  it('pausa futura (ainda não começou) é ignorada', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-10T12:00', [pause('2026-11-10T15:00')]);
    expect(r.status).toBe('ON_TIME');
    expect(iso(r.dueAt)).toBe('2026-11-11 11:20');
  });
  it('pausa iniciada depois do vencimento não esconde o atraso', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T12:00', [pause('2026-11-11T11:30')]);
    expect(r.status).toBe('OVERDUE');
  });
});

describe('status NEAR_DUE e OVERDUE', () => {
  it('ON_TIME com bastante saldo', () => {
    expect(run(P.arte_estatica, '2026-11-10T11:20', '2026-11-10T15:00').status).toBe('ON_TIME');
  });
  it('NEAR_DUE pelo piso de 2 horas úteis', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T10:00');
    expect(r.remainingBusinessMinutes).toBe(80);
    expect(r.status).toBe('NEAR_DUE');
  });
  it('NEAR_DUE pelos 25% em prazo longo (20 DU)', () => {
    const r = run(P.cardapio_catalogo, '2026-11-03T10:00', '2026-11-26T10:00');
    expect(r.remainingBusinessMinutes).toBe(4 * 480);
    expect(r.status).toBe('NEAR_DUE');
  });
  it('20 DU ainda ON_TIME com 6 dias úteis restantes', () => {
    expect(run(P.cardapio_catalogo, '2026-11-03T10:00', '2026-11-24T10:00').status).toBe('ON_TIME');
  });
  it('no instante do vencimento ainda não está atrasado', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T11:20');
    expect(r.status).toBe('NEAR_DUE');
    expect(r.remainingBusinessMinutes).toBe(0);
  });
  it('OVERDUE um minuto depois', () => {
    const r = run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T11:21');
    expect(r.status).toBe('OVERDUE');
    expect(r.remainingBusinessMinutes).toBe(-1);
  });
  it('atraso conta só tempo útil (almoço não conta)', () => {
    expect(run(P.arte_estatica, '2026-11-10T11:20', '2026-11-11T14:30').remainingBusinessMinutes).toBe(-130);
  });
});

describe('validação', () => {
  it('quantidade inválida', () => {
    expect(() => run({ model: 'business_days', amount: 0 }, '2026-11-10T11:00')).toThrow();
    expect(() => run({ model: 'business_days', amount: 1.5 }, '2026-11-10T11:00')).toThrow();
  });
  it('calendário sem períodos', () => {
    expect(() => run(P.arte_estatica, '2026-11-10T11:00', undefined, [], { timezone: 'America/Sao_Paulo', periods: {}, holidays: [] })).toThrow();
  });
  it('período mal formado', () => {
    const cal: BusinessCalendar = { timezone: 'America/Sao_Paulo', periods: { 1: [{ start: 800, end: 700 }] }, holidays: [] };
    expect(() => run(P.arte_estatica, '2026-11-10T11:00', undefined, [], cal)).toThrow();
  });
});
