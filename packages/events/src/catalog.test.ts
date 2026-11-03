import { describe, expect, it } from 'vitest';
import { backoffSeconds } from './outbox';
import { EVENT_CATALOG, EVENT_NAME, inngestName, parsePayload } from './catalog';

/** Eventos que a V3 exige para os Blocos 1 a 7 (antes listados como "planejados"). */
const REQUIRED = [
  'lead.created',
  'opportunity.created',
  'opportunity.stage_changed',
  'proposal.sent',
  'opportunity.won',
  'opportunity.converted',
  'client.created',
  'onboarding.started',
  'contract.confirmed',
  'contract.expiring',
  'request.created',
  'task.assigned',
  'task.blocked',
  'sla.near_due',
  'sla.overdue',
  'content.created',
  'content.submitted',
  'content.change_requested',
  'content.approved',
  'invoice.created',
  'invoice.paid',
  'invoice.overdue',
];

describe('catálogo de eventos', () => {
  it('todos os nomes seguem dominio.acao', () => {
    for (const t of Object.keys(EVENT_CATALOG)) expect(EVENT_NAME.test(t)).toBe(true);
  });
  it('cobre os eventos exigidos pela V3', () => {
    for (const t of REQUIRED) expect(Object.keys(EVENT_CATALOG)).toContain(t);
  });
  it('valida payload', () => {
    expect(parsePayload('holiday.created', { date: '2026-11-20', name: 'Consciência Negra' }).name).toBe(
      'Consciência Negra',
    );
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
