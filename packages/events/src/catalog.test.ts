import { describe, expect, it } from 'vitest';
import { backoffSeconds } from './outbox';
import { EVENT_CATALOG, EVENT_NAME, PLANNED_EVENTS, inngestName, parsePayload } from './catalog';

describe('catálogo de eventos', () => {
  it('todos os nomes seguem dominio.acao', () => {
    for (const t of [...Object.keys(EVENT_CATALOG), ...PLANNED_EVENTS]) expect(EVENT_NAME.test(t)).toBe(true);
  });
  it('valida payload', () => {
    expect(parsePayload('holiday.created', { date: '2026-11-20', name: 'Consciência Negra' }).name).toBe('Consciência Negra');
    expect(() => parsePayload('holiday.created', { date: 1 })).toThrow();
  });
  it('prefixo no Inngest', () => {
    expect(inngestName('content.approved')).toBe('aos/content.approved');
  });
  it('backoff cresce e tem teto de 1h', () => {
    expect(backoffSeconds(1)).toBe(10);
    expect(backoffSeconds(3)).toBe(40);
    expect(backoffSeconds(50)).toBe(3600);
  });
});
