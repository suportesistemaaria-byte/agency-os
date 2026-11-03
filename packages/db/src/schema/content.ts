import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tstz, updatedAt, workspaceId, wsFk, wsUnique } from './_shared';
import { approvalAction, contentStage, priority } from './enums';
import { clientContacts, clients } from './clients';
import { files } from './files';
import { workspaceMembers, workspaces } from './platform';

const ws = () => workspaceId().references(() => workspaces.id, { onDelete: 'cascade' });

export const campaigns = pgTable(
  'campaigns',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    objective: text('objective'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [wsUnique('campaigns', t), wsFk('campaigns', t, t.clientId, clients)],
);

/** scheduled_at nulo = gaveta do feed; feed e calendário usam a mesma entidade. */
export const contents = pgTable(
  'contents',
  {
    id: id(),
    workspaceId: ws(),
    clientId: uuid('client_id').notNull(),
    campaignId: uuid('campaign_id'),
    title: text('title').notNull(),
    platform: text('platform').notNull(),
    format: text('format').notNull(),
    stage: contentStage('stage').notNull().default('idea'),
    scheduledAt: tstz('scheduled_at'),
    feedPosition: integer('feed_position'),
    ownerId: uuid('owner_id'),
    copywriterId: uuid('copywriter_id'),
    designerId: uuid('designer_id'),
    priority: priority('priority').notNull().default('normal'),
    objective: text('objective'),
    pillar: text('pillar'),
    currentVersion: integer('current_version').notNull().default(0),
    deletedAt: tstz('deleted_at'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    wsUnique('contents', t),
    wsFk('contents', t, t.clientId, clients),
    wsFk('contents', t, t.campaignId, campaigns),
    wsFk('contents', t, t.ownerId, workspaceMembers),
    wsFk('contents', t, t.copywriterId, workspaceMembers),
    wsFk('contents', t, t.designerId, workspaceMembers),
    index('contents_calendar').on(t.workspaceId, t.clientId, t.scheduledAt),
    index('contents_stage').on(t.workspaceId, t.stage),
  ],
);

/** Versões imutáveis (só metadados mudam). */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: id(),
    workspaceId: ws(),
    contentId: uuid('content_id').notNull(),
    number: integer('number').notNull(),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('content_versions', t),
    unique('content_versions_number').on(t.contentId, t.number),
    wsFk('content_versions', t, t.contentId, contents),
  ],
);

export const contentCopies = pgTable(
  'content_copies',
  {
    id: id(),
    workspaceId: ws(),
    versionId: uuid('version_id').notNull().unique(),
    hook: text('hook'),
    caption: text('caption'),
    cta: text('cta'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('content_copies', t), wsFk('content_copies', t, t.versionId, contentVersions)],
);

export const contentAssets = pgTable(
  'content_assets',
  {
    id: id(),
    workspaceId: ws(),
    versionId: uuid('version_id').notNull(),
    fileId: uuid('file_id').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('content_assets', t),
    wsFk('content_assets', t, t.versionId, contentVersions),
    wsFk('content_assets', t, t.fileId, files),
  ],
);

export const contentComments = pgTable(
  'content_comments',
  {
    id: id(),
    workspaceId: ws(),
    contentId: uuid('content_id').notNull(),
    versionId: uuid('version_id').notNull(),
    authorMemberId: uuid('author_member_id'),
    authorContactId: uuid('author_contact_id'),
    visibility: text('visibility').notNull().default('internal'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('content_comments', t),
    wsFk('content_comments', t, t.contentId, contents),
    wsFk('content_comments', t, t.versionId, contentVersions),
    wsFk('content_comments', t, t.authorMemberId, workspaceMembers),
    wsFk('content_comments', t, t.authorContactId, clientContacts),
  ],
);

/** Anotação na arte: x/y em % (resistem a redimensionamento), página do carrossel e timestamp de vídeo. */
export const contentAnnotations = pgTable(
  'content_annotations',
  {
    id: id(),
    workspaceId: ws(),
    contentId: uuid('content_id').notNull(),
    versionId: uuid('version_id').notNull(),
    assetIndex: integer('asset_index').notNull().default(0),
    xPct: numeric('x_pct', { precision: 6, scale: 3 }),
    yPct: numeric('y_pct', { precision: 6, scale: 3 }),
    videoMs: integer('video_ms'),
    body: text('body').notNull(),
    authorMemberId: uuid('author_member_id'),
    authorContactId: uuid('author_contact_id'),
    resolvedAt: tstz('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('content_annotations', t),
    wsFk('content_annotations', t, t.contentId, contents),
    wsFk('content_annotations', t, t.versionId, contentVersions),
    wsFk('content_annotations', t, t.authorMemberId, workspaceMembers),
    wsFk('content_annotations', t, t.authorContactId, clientContacts),
    check(
      'content_annotations_position',
      sql`(x_pct IS NOT NULL AND y_pct IS NOT NULL AND x_pct BETWEEN 0 AND 100 AND y_pct BETWEEN 0 AND 100) OR video_ms IS NOT NULL`,
    ),
  ],
);

export const contentApprovals = pgTable(
  'content_approvals',
  {
    id: id(),
    workspaceId: ws(),
    contentId: uuid('content_id').notNull(),
    versionId: uuid('version_id').notNull(),
    action: approvalAction('action').notNull(),
    actorMemberId: uuid('actor_member_id'),
    actorContactId: uuid('actor_contact_id'),
    origin: text('origin').notNull().default('internal'),
    justification: text('justification'),
    createdAt: createdAt(),
  },
  (t) => [
    wsUnique('content_approvals', t),
    wsFk('content_approvals', t, t.contentId, contents),
    wsFk('content_approvals', t, t.versionId, contentVersions),
    wsFk('content_approvals', t, t.actorMemberId, workspaceMembers),
    wsFk('content_approvals', t, t.actorContactId, clientContacts),
    check(
      'content_approvals_on_behalf_justification',
      sql`action <> 'approved_on_behalf' OR length(trim(coalesce(justification, ''))) >= 10`,
    ),
  ],
);

export const contentStageHistory = pgTable(
  'content_stage_history',
  {
    id: id(),
    workspaceId: ws(),
    contentId: uuid('content_id').notNull(),
    fromStage: contentStage('from_stage'),
    toStage: contentStage('to_stage').notNull(),
    actorId: uuid('actor_id'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [wsUnique('content_stage_history', t), wsFk('content_stage_history', t, t.contentId, contents)],
);
