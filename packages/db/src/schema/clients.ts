import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { clientStatus, contractStatus, itemKind } from './enums';
import { opportunities, organizations, people, proposals } from './crm';
import { workspaceMembers, workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });
const cents = (n: string) => bigint(n, { mode: 'number' });

export const services = pgTable(
  'services',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    kind: itemKind('kind').notNull().default('recurring'),
    defaultCents: cents('default_cents').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('services', t)],
);

export const clients = pgTable(
  'clients',
  {
    id: id(),
    workspaceId: ws(),
    organizationId: uuid('organization_id').notNull(),
    /** Oportunidade de origem: no máximo um cliente por oportunidade. */
    opportunityId: uuid('opportunity_id').unique(),
    name: text('name').notNull(),
    segment: text('segment'),
    plan: text('plan'),
    status: clientStatus('status').notNull().default('onboarding'),
    ownerId: uuid('owner_id'),
    color: text('color'),
    startedOn: date('started_on'),
    deletedAt: tstz('deleted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('clients', t),
    wsFk('clients', t, t.organizationId, organizations),
    wsFk('clients', t, t.opportunityId, opportunities),
    wsFk('clients', t, t.ownerId, workspaceMembers),
  ],
);

/** Contato do cliente com as 6 permissões do portal (V3, seção 5). */
export const clientContacts = pgTable(
  'client_contacts',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    personId: uuid('person_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    canView: boolean('can_view').notNull().default(true),
    canComment: boolean('can_comment').notNull().default(true),
    canRequest: boolean('can_request').notNull().default(true),
    canApprove: boolean('can_approve').notNull().default(false),
    receivesFinance: boolean('receives_finance').notNull().default(false),
    receivesNotifications: boolean('receives_notifications').notNull().default(true),
    userId: uuid('user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('client_contacts', t),
    unique('client_contacts_person').on(t.clientId, t.personId),
    wsFk('client_contacts', t, t.clientId, clients),
    wsFk('client_contacts', t, t.personId, people),
  ],
);

/** Equipe da conta: função → membro (responsável padrão por função). */
export const clientTeam = pgTable(
  'client_team',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    function: text('function').notNull(),
    memberId: uuid('member_id').notNull(),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('client_team', t),
    unique('client_team_member').on(t.clientId, t.function, t.memberId),
    wsFk('client_team', t, t.clientId, clients),
    wsFk('client_team', t, t.memberId, workspaceMembers),
    index('client_team_member_idx').on(t.workspaceId, t.memberId),
  ],
);

export const onboardingTemplates = pgTable(
  'onboarding_templates',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('onboarding_templates', t)],
);

export const onboardingTemplateSteps = pgTable(
  'onboarding_template_steps',
  {
    id: id(),
    workspaceId: ws(),
    templateId: uuid('template_id').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    function: text('function').notNull(),
    businessDays: integer('business_days').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('onboarding_template_steps', t),
    wsFk('onboarding_template_steps', t, t.templateId, onboardingTemplates),
  ],
);

export const clientOnboardings = pgTable(
  'client_onboardings',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    templateId: uuid('template_id'),
    startedAt: tstz('started_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('client_onboardings', t),
    wsFk('client_onboardings', t, t.clientId, clients),
    wsFk('client_onboardings', t, t.templateId, onboardingTemplates),
  ],
);

export const onboardingSteps = pgTable(
  'onboarding_steps',
  {
    id: id(),
    workspaceId: ws(),
    onboardingId: uuid('onboarding_id').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    function: text('function').notNull(),
    assigneeId: uuid('assignee_id'),
    dueAt: tstz('due_at'),
    doneAt: tstz('done_at'),
    doneBy: uuid('done_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('onboarding_steps', t),
    wsFk('onboarding_steps', t, t.onboardingId, clientOnboardings),
    wsFk('onboarding_steps', t, t.assigneeId, workspaceMembers),
  ],
);

/** Health score com fatores: o score sempre mostra o porquê. */
export const clientHealthScores = pgTable(
  'client_health_scores',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    date: date('date').notNull(),
    score: integer('score').notNull(),
    factors: jsonb('factors').$type<{ key: string; label: string; points: number }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('client_health_scores', t),
    unique('client_health_scores_day').on(t.clientId, t.date),
    wsFk('client_health_scores', t, t.clientId, clients),
  ],
);

export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    opportunityId: uuid('opportunity_id'),
    proposalId: uuid('proposal_id'),
    number: text('number').notNull(),
    status: contractStatus('status').notNull().default('pending_finance_confirmation'),
    startOn: date('start_on').notNull(),
    endOn: date('end_on'),
    billingDay: integer('billing_day').notNull().default(10),
    changeLimit: integer('change_limit').notNull().default(2),
    confirmedAt: tstz('confirmed_at'),
    confirmedBy: uuid('confirmed_by'),
    deletedAt: tstz('deleted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('contracts', t),
    unique('contracts_number').on(t.workspaceId, t.number),
    wsFk('contracts', t, t.clientId, clients),
    wsFk('contracts', t, t.opportunityId, opportunities),
    wsFk('contracts', t, t.proposalId, proposals),
  ],
);

export const contractItems = pgTable(
  'contract_items',
  {
    id: id(),
    workspaceId: ws(),
    contractId: uuid('contract_id').notNull(),
    serviceId: uuid('service_id'),
    /** Item incluído por aditivo (upsell/renovação). */
    amendmentId: uuid('amendment_id'),
    description: text('description').notNull(),
    kind: itemKind('kind').notNull(),
    amountCents: cents('amount_cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('contract_items', t),
    wsFk('contract_items', t, t.contractId, contracts),
    wsFk('contract_items', t, t.serviceId, services),
  ],
);

/** Aditivo: upsell/renovação ganhos alteram o contrato sem perder o histórico (V3). */
export const contractAmendments = pgTable(
  'contract_amendments',
  {
    id: id(),
    workspaceId: ws(),
    contractId: uuid('contract_id').notNull(),
    opportunityId: uuid('opportunity_id').unique(),
    kind: text('kind').notNull(),
    description: text('description').notNull(),
    mrrDeltaCents: cents('mrr_delta_cents').notNull().default(0),
    setupCents: cents('setup_cents').notNull().default(0),
    previousEndOn: date('previous_end_on'),
    newEndOn: date('new_end_on'),
    effectiveOn: date('effective_on').notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('contract_amendments', t),
    wsFk('contract_amendments', t, t.contractId, contracts),
    wsFk('contract_amendments', t, t.opportunityId, opportunities),
  ],
);
