import { z } from 'zod';

/**
 * Catálogo de eventos (V3, seção 20). Cada evento declara o schema do payload.
 * Novos eventos entram aqui na sprint do domínio correspondente; nomes no formato dominio.acao (passado).
 */
const id = z.string().uuid();
const opt = id.nullable().optional();
const e = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

export const EVENT_CATALOG = {
  // Plataforma
  'workspace.created': z.object({ slug: z.string() }),
  'sla.policy_changed': z.object({ key: z.string(), before: z.unknown(), after: z.unknown() }),
  'holiday.created': z.object({ date: z.string(), name: z.string() }),
  'system.healthcheck': z.object({ source: z.string() }),
  'member.invited': e({ email: z.string(), roleKeys: z.array(z.string()) }),
  'member.joined': e({ memberId: id }),
  'member.role_changed': e({ memberId: id, roleKeys: z.array(z.string()) }),
  'member.status_changed': e({ memberId: id, status: z.string() }),
  'permission.changed': e({ memberId: id, permission: z.string(), effect: z.string().nullable() }),
  'file.uploaded': e({ fileId: id, clientId: opt }),
  // CRM
  'lead.created': e({ leadId: id, opportunityId: id, ownerId: opt }),
  'opportunity.created': e({ opportunityId: id }),
  'opportunity.stage_changed': e({ opportunityId: id, fromStageId: opt, toStageId: id }),
  'opportunity.state_changed': e({ opportunityId: id, from: z.string(), to: z.string() }),
  'opportunity.won': e({ opportunityId: id }),
  'opportunity.lost': e({ opportunityId: id, lostReasonId: id }),
  'opportunity.converted': e({ opportunityId: id, clientId: id }),
  'activity.logged': e({ opportunityId: opt, type: z.string() }),
  'next_action.due': e({ nextActionId: id }),
  'proposal.created': e({ proposalId: id, opportunityId: id }),
  'proposal.sent': e({ proposalId: id, opportunityId: id, version: z.number().int() }),
  'proposal.accepted': e({ proposalId: id, opportunityId: id }),
  'proposal.refused': e({ proposalId: id, opportunityId: id }),
  // Clientes e contratos
  'client.created': e({ clientId: id, opportunityId: opt }),
  'client.status_changed': e({ clientId: id, from: z.string(), to: z.string() }),
  'onboarding.started': e({ clientId: id, onboardingId: id }),
  'onboarding.step_completed': e({ clientId: id, stepId: id }),
  'onboarding.completed': e({ clientId: id, onboardingId: id }),
  'contact.permissions_changed': e({ clientId: id, contactId: id }),
  'contract.created': e({ contractId: id, clientId: id }),
  'contract.confirmed': e({ contractId: id, clientId: id }),
  'contract.expiring': e({ contractId: id, clientId: id, daysLeft: z.number().int() }),
  'contract.amended': e({ contractId: id, clientId: id, amendmentId: id, kind: z.string() }),
  // Operação
  'request.created': e({ requestId: id, clientId: id, type: z.string() }),
  'request.triaged': e({ requestId: id, assigneeId: opt }),
  'request.status_changed': e({ requestId: id, from: z.string(), to: z.string() }),
  'task.created': e({ taskId: id, assigneeId: opt }),
  'task.assigned': e({ taskId: id, assigneeId: id }),
  'task.blocked': e({ taskId: id, reason: z.string() }),
  'task.unblocked': e({ taskId: id }),
  'task.completed': e({ taskId: id }),
  'task.commented': e({ taskId: id }),
  'meeting.created': e({ meetingId: id }),
  'meeting.decision_created': e({ meetingId: id, decisionId: id, taskId: opt }),
  'campaign.created': e({ campaignId: id, clientId: id }),
  'client.health_changed': e({ clientId: id, from: z.number().nullable(), to: z.number().nullable() }),
  // SLA
  'sla.started': e({ clockId: id, entityType: z.string(), entityId: id, dueAt: z.string().nullable() }),
  'sla.paused': e({ clockId: id, kind: z.string() }),
  'sla.resumed': e({ clockId: id, dueAt: z.string().nullable() }),
  'sla.near_due': e({ clockId: id, entityType: z.string(), entityId: id }),
  'sla.overdue': e({ clockId: id, entityType: z.string(), entityId: id }),
  'sla.met': e({ clockId: id, onTime: z.boolean() }),
  'sla.overridden': e({ clockId: id, reason: z.string() }),
  // Conteúdo e aprovações
  'content.created': e({ contentId: id, clientId: id }),
  'content.stage_changed': e({ contentId: id, from: z.string(), to: z.string() }),
  'content.version_uploaded': e({ contentId: id, version: z.number().int() }),
  'content.submitted': e({ contentId: id, version: z.number().int() }),
  'content.change_requested': e({ contentId: id, version: z.number().int(), clientId: id }),
  'content.approved': e({ contentId: id, version: z.number().int() }),
  'content.approved_on_behalf': e({ contentId: id, version: z.number().int() }),
  'content.scheduled': e({ contentId: id, scheduledAt: z.string() }),
  'comment.created': e({ contentId: id, versionId: id }),
  'annotation.created': e({ contentId: id, versionId: id }),
  // Financeiro
  'invoice.created': e({ invoiceId: id, clientId: id }),
  'invoice.paid': e({ invoiceId: id }),
  'invoice.overdue': e({ invoiceId: id, clientId: id }),
  'payment.recorded': e({ invoiceId: id, paymentId: id, amountCents: z.number().int() }),
  'expense.created': e({ expenseId: id }),
  'payable.paid': e({ expenseId: id }),
} as const;

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
