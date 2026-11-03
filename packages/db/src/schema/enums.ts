import { pgEnum } from 'drizzle-orm/pg-core';

export const memberStatus = pgEnum('member_status', ['invited', 'active', 'suspended']);
export const permissionScope = pgEnum('permission_scope', ['all', 'team', 'own']);
export const overrideEffect = pgEnum('override_effect', ['grant', 'deny']);
export const actorType = pgEnum('actor_type', ['user', 'client_contact', 'system', 'automation']);
export const slaModel = pgEnum('sla_model', ['business_days', 'business_hours']);
export const holidayKind = pgEnum('holiday_kind', ['national', 'state', 'municipal', 'recess']);

// ── Enums da V3 (seção 6) ──
export const opportunityType = pgEnum('opportunity_type', ['new', 'upsell', 'renewal']);
export const opportunityState = pgEnum('opportunity_state', ['open', 'no_response', 'paused', 'lost', 'won']);
export const temperature = pgEnum('temperature', ['cold', 'warm', 'hot']);
export const proposalStatus = pgEnum('proposal_status', [
  'draft',
  'ready',
  'sent',
  'viewed',
  'negotiation',
  'accepted',
  'refused',
  'expired',
]);
export const activityType = pgEnum('activity_type', [
  'call',
  'whatsapp',
  'email',
  'meeting',
  'followup',
  'proposal',
  'note',
  'task',
  'negotiation',
]);
export const clientStatus = pgEnum('client_status', [
  'onboarding',
  'active',
  'attention',
  'critical',
  'paused',
  'churned',
]);
export const contractStatus = pgEnum('contract_status', [
  'pending_finance_confirmation',
  'active',
  'ended',
  'cancelled',
]);
export const requestType = pgEnum('request_type', [
  'arte_estatica',
  'arte_impresso',
  'video',
  'alteracao',
  'fotos_editadas',
  'cardapio',
  'catalogo',
  'outro',
]);
export const requestStatus = pgEnum('request_status', [
  'received',
  'triage',
  'assigned',
  'in_production',
  'review',
  'client_approval',
  'delivered',
  'cancelled',
]);
export const taskStatus = pgEnum('task_status', [
  'todo',
  'in_progress',
  'blocked',
  'review',
  'done',
  'cancelled',
]);
export const priority = pgEnum('priority', ['low', 'normal', 'high', 'urgent']);
export const slaStatus = pgEnum('sla_status', [
  'on_time',
  'near_due',
  'overdue',
  'paused',
  'blocked',
  'met',
  'missed',
]);
export const pauseKind = pgEnum('pause_kind', ['client', 'blocked']);
export const contentStage = pgEnum('content_stage', [
  'idea',
  'planning',
  'production',
  'copy',
  'design',
  'internal_review',
  'client_approval',
  'change_requested',
  'approved',
  'scheduled',
  'posted',
]);
export const approvalAction = pgEnum('approval_action', [
  'submitted',
  'approved',
  'change_requested',
  'approved_on_behalf',
  'reopened',
]);
export const invoiceStatus = pgEnum('invoice_status', [
  'draft',
  'issued',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled',
]);
export const itemKind = pgEnum('item_kind', ['setup', 'recurring', 'one_off']);
export const expenseKind = pgEnum('expense_kind', ['fixed', 'variable']);
export const executionStatus = pgEnum('execution_status', ['ok', 'skipped', 'failed']);
