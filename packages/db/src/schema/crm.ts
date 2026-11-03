import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { activityType, opportunityState, opportunityType, proposalStatus, temperature } from './enums';
import { workspaceMembers, workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });
const cents = (n: string) => bigint(n, { mode: 'number' });

/** Empresa compartilhada por Lead, Oportunidade, Cliente e Contato (sem recadastro). */
export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    cnpj: text('cnpj'),
    segment: text('segment'),
    city: text('city'),
    website: text('website'),
    instagram: text('instagram'),
    address: text('address'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('organizations', t), index('organizations_name').on(t.workspaceId, t.name)],
);

export const people = pgTable(
  'people',
  {
    id: id(),
    workspaceId: ws(),
    organizationId: uuid('organization_id'),
    name: text('name').notNull(),
    roleTitle: text('role_title'),
    email: text('email'),
    phone: text('phone'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('people', t), wsFk('people', t, t.organizationId, organizations)],
);

export const pipelines = pgTable(
  'pipelines',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('pipelines', t)],
);

export const pipelineStages = pgTable(
  'pipeline_stages',
  {
    id: id(),
    workspaceId: ws(),
    pipelineId: uuid('pipeline_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    probability: integer('probability').notNull().default(0),
    isWon: boolean('is_won').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('pipeline_stages', t),
    unique('pipeline_stages_key').on(t.workspaceId, t.pipelineId, t.key),
    wsFk('pipeline_stages', t, t.pipelineId, pipelines),
  ],
);

export const lostReasons = pgTable(
  'lost_reasons',
  {
    id: id(),
    workspaceId: ws(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('lost_reasons', t)],
);

export const leads = pgTable(
  'leads',
  {
    id: id(),
    workspaceId: ws(),
    organizationId: uuid('organization_id').notNull(),
    personId: uuid('person_id'),
    source: text('source'),
    campaign: text('campaign'),
    temperature: temperature('temperature').notNull().default('warm'),
    ownerId: uuid('owner_id'),
    need: text('need'),
    budget: text('budget'),
    status: text('status').notNull().default('open'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('leads', t),
    wsFk('leads', t, t.organizationId, organizations),
    wsFk('leads', t, t.personId, people),
    wsFk('leads', t, t.ownerId, workspaceMembers),
  ],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: id(),
    workspaceId: ws(),
    pipelineId: uuid('pipeline_id').notNull(),
    stageId: uuid('stage_id').notNull(),
    leadId: uuid('lead_id'),
    organizationId: uuid('organization_id').notNull(),
    personId: uuid('person_id'),
    /** Cliente existente (upsell/renovação). */
    clientId: uuid('client_id'),
    type: opportunityType('type').notNull().default('new'),
    state: opportunityState('state').notNull().default('open'),
    temperature: temperature('temperature').notNull().default('warm'),
    ownerId: uuid('owner_id'),
    title: text('title').notNull(),
    service: text('service'),
    setupCents: cents('setup_cents').notNull().default(0),
    mrrCents: cents('mrr_cents').notNull().default(0),
    source: text('source'),
    expectedCloseOn: date('expected_close_on'),
    lastInteractionAt: tstz('last_interaction_at'),
    lostReasonId: uuid('lost_reason_id'),
    lostNote: text('lost_note'),
    position: integer('position').notNull().default(0),
    wonAt: tstz('won_at'),
    convertedClientId: uuid('converted_client_id'),
    convertedAt: tstz('converted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('opportunities', t),
    wsFk('opportunities', t, t.pipelineId, pipelines),
    wsFk('opportunities', t, t.stageId, pipelineStages),
    wsFk('opportunities', t, t.leadId, leads),
    wsFk('opportunities', t, t.organizationId, organizations),
    wsFk('opportunities', t, t.personId, people),
    wsFk('opportunities', t, t.ownerId, workspaceMembers),
    wsFk('opportunities', t, t.lostReasonId, lostReasons),
    index('opportunities_pipeline')
      .on(t.workspaceId, t.stageId, t.state)
      .where(sql`state = 'open'`),
    check('opportunities_lost_reason', sql`state <> 'lost' OR lost_reason_id IS NOT NULL`),
    check('opportunities_upsell_client', sql`type = 'new' OR client_id IS NOT NULL`),
  ],
);

export const commercialActivities = pgTable(
  'commercial_activities',
  {
    id: id(),
    workspaceId: ws(),
    opportunityId: uuid('opportunity_id'),
    organizationId: uuid('organization_id').notNull(),
    type: activityType('type').notNull(),
    summary: text('summary').notNull(),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
    actorId: uuid('actor_id'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('commercial_activities', t),
    wsFk('commercial_activities', t, t.opportunityId, opportunities),
    wsFk('commercial_activities', t, t.organizationId, organizations),
    wsFk('commercial_activities', t, t.actorId, workspaceMembers),
    index('commercial_activities_org').on(t.workspaceId, t.organizationId, t.occurredAt),
  ],
);

/** Toda oportunidade aberta precisa de próxima ação (regra aprovada). */
export const nextActions = pgTable(
  'next_actions',
  {
    id: id(),
    workspaceId: ws(),
    opportunityId: uuid('opportunity_id').notNull(),
    title: text('title').notNull(),
    dueAt: tstz('due_at').notNull(),
    ownerId: uuid('owner_id'),
    doneAt: tstz('done_at'),
    source: text('source').notNull().default('manual'),
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('next_actions', t),
    unique('next_actions_idem').on(t.workspaceId, t.idempotencyKey),
    wsFk('next_actions', t, t.opportunityId, opportunities),
    wsFk('next_actions', t, t.ownerId, workspaceMembers),
    index('next_actions_due')
      .on(t.workspaceId, t.ownerId, t.dueAt)
      .where(sql`done_at IS NULL`),
  ],
);

export const proposals = pgTable(
  'proposals',
  {
    id: id(),
    workspaceId: ws(),
    opportunityId: uuid('opportunity_id').notNull(),
    number: text('number').notNull(),
    title: text('title').notNull(),
    status: proposalStatus('status').notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(1),
    validUntil: date('valid_until'),
    sentAt: tstz('sent_at'),
    acceptedAt: tstz('accepted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('proposals', t),
    unique('proposals_number').on(t.workspaceId, t.number),
    wsFk('proposals', t, t.opportunityId, opportunities),
  ],
);

export const proposalVersions = pgTable(
  'proposal_versions',
  {
    id: id(),
    workspaceId: ws(),
    proposalId: uuid('proposal_id').notNull(),
    number: integer('number').notNull(),
    notes: text('notes'),
    setupCents: cents('setup_cents').notNull().default(0),
    mrrCents: cents('mrr_cents').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('proposal_versions', t),
    unique('proposal_versions_number').on(t.proposalId, t.number),
    wsFk('proposal_versions', t, t.proposalId, proposals),
  ],
);

export const proposalItems = pgTable(
  'proposal_items',
  {
    id: id(),
    workspaceId: ws(),
    versionId: uuid('version_id').notNull(),
    description: text('description').notNull(),
    kind: text('kind').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitCents: cents('unit_cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('proposal_items', t), wsFk('proposal_items', t, t.versionId, proposalVersions)],
);

export const salesGoals = pgTable(
  'sales_goals',
  {
    id: id(),
    workspaceId: ws(),
    period: text('period').notNull(),
    ownerId: uuid('owner_id'),
    mrrTargetCents: cents('mrr_target_cents').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('sales_goals', t),
    unique('sales_goals_period').on(t.workspaceId, t.period, t.ownerId),
    wsFk('sales_goals', t, t.ownerId, workspaceMembers),
  ],
);
