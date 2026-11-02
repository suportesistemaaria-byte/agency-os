import { z } from 'zod';

/**
 * Catálogo de eventos (V3, seção 20). Cada evento declara o schema do payload.
 * Novos eventos entram aqui na sprint do domínio correspondente; nomes no formato dominio.acao (passado).
 */
export const EVENT_CATALOG = {
  'workspace.created': z.object({ slug: z.string() }),
  'sla.policy_changed': z.object({ key: z.string(), before: z.unknown(), after: z.unknown() }),
  'holiday.created': z.object({ date: z.string(), name: z.string() }),
  'system.healthcheck': z.object({ source: z.string() }),
} as const;

/** Eventos já previstos na V3 que serão adicionados nas próximas sprints (referência). */
export const PLANNED_EVENTS = [
  'lead.created', 'opportunity.created', 'opportunity.stage_changed', 'proposal.sent', 'opportunity.won', 'opportunity.converted',
  'client.created', 'onboarding.started', 'contract.confirmed', 'contract.expiring', 'request.created', 'task.assigned',
  'task.blocked', 'task.overdue', 'sla.near_due', 'sla.overdue', 'content.created', 'content.submitted',
  'content.change_requested', 'content.approved', 'invoice.created', 'invoice.paid', 'invoice.overdue',
] as const;

export type EventType = keyof typeof EVENT_CATALOG;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_CATALOG)[T]>;

export const EVENT_NAME = /^[a-z_]+\.[a-z_]+$/;

export function parsePayload<T extends EventType>(type: T, payload: unknown): EventPayload<T> {
  const schema = EVENT_CATALOG[type];
  if (!schema) throw new Error(`Evento fora do catálogo: ${String(type)}`);
  return schema.parse(payload) as EventPayload<T>;
}

/** Nome do evento no Inngest. */
export const inngestName = (type: string): string => `aos/${type}`;
