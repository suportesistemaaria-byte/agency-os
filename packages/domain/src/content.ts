import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';
import { scopeWhere } from './scope';
import { can } from './permissions';
import { STAGE_LABEL, STAGES, PLATFORMS, FORMATS } from './labels';
export { STAGE_LABEL, STAGES, PLATFORMS, FORMATS };

export type Stage = (typeof s.contentStage.enumValues)[number];
type Priority = (typeof s.priority.enumValues)[number];

/** Etapas que a equipe move livremente; as demais só por ações (envio, aprovação, alteração). */
const FREE_STAGES: Stage[] = ['idea', 'planning', 'production', 'copy', 'design', 'internal_review'];

const contentRes = (c: {
  clientId: string;
  ownerId: string | null;
  copywriterId: string | null;
  designerId: string | null;
}) => ({
  clientId: c.clientId,
  ownerMemberIds: [c.ownerId, c.copywriterId, c.designerId],
});

export async function getContentRow(tx: Tx, id: string) {
  const [c] = await tx
    .select()
    .from(s.contents)
    .where(and(eq(s.contents.id, id), isNull(s.contents.deletedAt)));
  return must(c, 'Conteúdo não encontrado.');
}

export async function listContents(
  ctx: Ctx,
  opts: { clientId?: string; from?: Date; to?: Date; stages?: Stage[]; drawer?: boolean } = {},
) {
  assertCan(ctx, 'conteudo.view');
  return read(ctx, async (tx) => {
    const conds = [isNull(s.contents.deletedAt)];
    const sc = scopeWhere(ctx, 'conteudo.view', {
      client: s.contents.clientId,
      owners: [s.contents.ownerId, s.contents.copywriterId, s.contents.designerId],
    });
    if (sc) conds.push(sc);
    if (opts.clientId) conds.push(eq(s.contents.clientId, opts.clientId));
    if (opts.from) conds.push(gte(s.contents.scheduledAt, opts.from));
    if (opts.to) conds.push(lt(s.contents.scheduledAt, opts.to));
    if (opts.stages?.length) conds.push(inArray(s.contents.stage, opts.stages));
    if (opts.drawer === true) conds.push(isNull(s.contents.scheduledAt));
    if (opts.drawer === false) conds.push(isNotNull(s.contents.scheduledAt));
    const rows = await tx
      .select({
        c: s.contents,
        client: s.clients.name,
        clientColor: s.clients.color,
        owner: s.users.name,
        campaign: s.campaigns.name,
      })
      .from(s.contents)
      .innerJoin(s.clients, eq(s.clients.id, s.contents.clientId))
      .leftJoin(s.campaigns, eq(s.campaigns.id, s.contents.campaignId))
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.contents.ownerId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(and(...conds))
      .orderBy(desc(s.contents.scheduledAt), asc(s.contents.feedPosition), desc(s.contents.createdAt));
    const ids = rows.map((r) => r.c.id);
    // Miniatura: primeiro arquivo da versão atual.
    const thumbs = ids.length
      ? await tx
          .select({
            contentId: s.contentVersions.contentId,
            fileId: s.contentAssets.fileId,
            mime: s.files.mime,
          })
          .from(s.contentVersions)
          .innerJoin(
            s.contents,
            and(
              eq(s.contents.id, s.contentVersions.contentId),
              eq(s.contents.currentVersion, s.contentVersions.number),
            ),
          )
          .innerJoin(
            s.contentAssets,
            and(eq(s.contentAssets.versionId, s.contentVersions.id), eq(s.contentAssets.position, 0)),
          )
          .innerJoin(s.files, eq(s.files.id, s.contentAssets.fileId))
          .where(inArray(s.contentVersions.contentId, ids))
      : [];
    return rows.map((r) => ({
      ...r.c,
      clientName: r.client,
      clientColor: r.clientColor,
      ownerName: r.owner,
      campaignName: r.campaign,
      thumbFileId: thumbs.find((t) => t.contentId === r.c.id)?.fileId ?? null,
      thumbMime: thumbs.find((t) => t.contentId === r.c.id)?.mime ?? null,
    }));
  });
}

export async function getContent(ctx: Ctx, id: string) {
  assertCan(ctx, 'conteudo.view');
  return read(ctx, async (tx) => {
    const c = await getContentRow(tx, id);
    assertCan(ctx, 'conteudo.view', contentRes(c));
    const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, c.clientId));
    const [campaign] = c.campaignId
      ? await tx.select().from(s.campaigns).where(eq(s.campaigns.id, c.campaignId))
      : [];
    const versions = await tx
      .select()
      .from(s.contentVersions)
      .where(eq(s.contentVersions.contentId, id))
      .orderBy(desc(s.contentVersions.number));
    const vIds = versions.map((v) => v.id);
    const copies = vIds.length
      ? await tx.select().from(s.contentCopies).where(inArray(s.contentCopies.versionId, vIds))
      : [];
    const assets = vIds.length
      ? await tx
          .select({ a: s.contentAssets, f: s.files })
          .from(s.contentAssets)
          .innerJoin(s.files, eq(s.files.id, s.contentAssets.fileId))
          .where(inArray(s.contentAssets.versionId, vIds))
          .orderBy(asc(s.contentAssets.position))
      : [];
    const comments = await tx
      .select({ c: s.contentComments, member: s.users.name, contact: s.people.name })
      .from(s.contentComments)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.contentComments.authorMemberId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .leftJoin(s.clientContacts, eq(s.clientContacts.id, s.contentComments.authorContactId))
      .leftJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.contentComments.contentId, id))
      .orderBy(asc(s.contentComments.createdAt));
    const annotations = await tx
      .select({ a: s.contentAnnotations, member: s.users.name, contact: s.people.name })
      .from(s.contentAnnotations)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.contentAnnotations.authorMemberId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .leftJoin(s.clientContacts, eq(s.clientContacts.id, s.contentAnnotations.authorContactId))
      .leftJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.contentAnnotations.contentId, id))
      .orderBy(asc(s.contentAnnotations.createdAt));
    const approvals = await tx
      .select({ a: s.contentApprovals, member: s.users.name, contact: s.people.name })
      .from(s.contentApprovals)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.contentApprovals.actorMemberId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .leftJoin(s.clientContacts, eq(s.clientContacts.id, s.contentApprovals.actorContactId))
      .leftJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.contentApprovals.contentId, id))
      .orderBy(desc(s.contentApprovals.createdAt));
    const history = await tx
      .select({ h: s.contentStageHistory, actor: s.users.name })
      .from(s.contentStageHistory)
      .leftJoin(s.workspaceMembers, eq(s.workspaceMembers.id, s.contentStageHistory.actorId))
      .leftJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.contentStageHistory.contentId, id))
      .orderBy(desc(s.contentStageHistory.createdAt));
    const people = await tx
      .select({ id: s.workspaceMembers.id, name: s.users.name })
      .from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(
        inArray(
          s.workspaceMembers.id,
          [c.ownerId, c.copywriterId, c.designerId]
            .filter((x): x is string => Boolean(x))
            .concat(['00000000-0000-0000-0000-000000000000']),
        ),
      );
    const nameOf = (mid: string | null) => people.find((p) => p.id === mid)?.name ?? null;
    return {
      content: c,
      client: client!,
      campaign: campaign ?? null,
      ownerName: nameOf(c.ownerId),
      copywriterName: nameOf(c.copywriterId),
      designerName: nameOf(c.designerId),
      versions: versions.map((v) => ({
        ...v,
        copy: copies.find((x) => x.versionId === v.id) ?? null,
        assets: assets.filter((a) => a.a.versionId === v.id).map((a) => ({ ...a.a, file: a.f })),
      })),
      comments,
      annotations,
      approvals,
      history,
      canEdit: can(ctx, 'conteudo.create', contentRes(c)),
      canApproveOnBehalf: can(ctx, 'conteudo.approve_on_behalf'),
    };
  });
}

export interface ContentInput {
  clientId: string;
  campaignId?: string | null;
  title: string;
  platform: string;
  format: string;
  scheduledAt?: Date | null;
  ownerId?: string | null;
  copywriterId?: string | null;
  designerId?: string | null;
  priority?: Priority;
  objective?: string;
  pillar?: string;
}

async function stageChange(
  kit: CommandKit,
  c: { id: string; stage: Stage },
  to: Stage,
  actorId: string | null,
  note?: string,
) {
  await kit.tx.update(s.contents).set({ stage: to, updatedAt: new Date() }).where(eq(s.contents.id, c.id));
  await kit.tx.insert(s.contentStageHistory).values({
    workspaceId: kit.ctx.workspaceId,
    contentId: c.id,
    fromStage: c.stage,
    toStage: to,
    actorId,
    note,
  });
  await kit.emit({
    type: 'content.stage_changed',
    entityType: 'content',
    entityId: c.id,
    payload: { contentId: c.id, from: c.stage, to },
  });
}
export { stageChange };

export async function createContent(ctx: Ctx, input: ContentInput) {
  assertCan(ctx, 'conteudo.create', { clientId: input.clientId, ownerMemberIds: [ctx.memberId] });
  if (!input.title.trim()) throw badRequest('Informe o título.');
  return command('content.create', ctx, async (kit) => {
    const [c] = await kit.tx
      .insert(s.contents)
      .values({
        workspaceId: ctx.workspaceId,
        ...input,
        title: input.title.trim(),
        ownerId: input.ownerId ?? ctx.memberId,
        createdBy: ctx.userId,
      })
      .returning();
    await kit.tx.insert(s.contentStageHistory).values({
      workspaceId: ctx.workspaceId,
      contentId: c!.id,
      fromStage: null,
      toStage: 'idea',
      actorId: ctx.memberId,
      note: 'Criado',
    });
    await kit.audit({ action: 'content.created', entityType: 'content', entityId: c!.id, after: c! });
    await kit.emit({
      type: 'content.created',
      entityType: 'content',
      entityId: c!.id,
      payload: { contentId: c!.id, clientId: input.clientId },
    });
    return c!;
  });
}

export async function updateContent(ctx: Ctx, id: string, patch: Partial<Omit<ContentInput, 'clientId'>>) {
  return command('content.update', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, id);
    assertCan(ctx, 'conteudo.create', contentRes(c));
    const [after] = await kit.tx
      .update(s.contents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(s.contents.id, id))
      .returning();
    await kit.audit({
      action: 'content.updated',
      entityType: 'content',
      entityId: id,
      before: c,
      after: after!,
    });
    if (patch.scheduledAt && after!.scheduledAt)
      await kit.emit({
        type: 'content.scheduled',
        entityType: 'content',
        entityId: id,
        payload: { contentId: id, scheduledAt: after!.scheduledAt.toISOString() },
      });
    return after!;
  });
}

/** Movimento livre nas etapas de produção (Kanban). Envio, aprovação e alteração têm ações próprias. */
export async function moveContentStage(ctx: Ctx, id: string, to: Stage) {
  return command('content.moveStage', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, id);
    assertCan(ctx, 'conteudo.create', contentRes(c));
    if (c.stage === to) return;
    const allowedFromApproved =
      (c.stage === 'approved' && to === 'scheduled') || (c.stage === 'scheduled' && to === 'posted');
    if (!allowedFromApproved && (!FREE_STAGES.includes(to) || !FREE_STAGES.includes(c.stage)))
      throw badRequest(
        'Esta etapa muda por ação própria (enviar para aprovação, aprovar ou pedir alteração).',
      );
    if (to === 'internal_review' && c.currentVersion === 0)
      throw badRequest('Suba ao menos uma versão com arquivo antes da revisão.');
    if (to === 'scheduled' && !c.scheduledAt)
      throw badRequest('Defina a data de publicação antes de agendar.');
    await stageChange(kit, c, to, ctx.memberId);
    await kit.audit({
      action: 'content.stage_changed',
      entityType: 'content',
      entityId: id,
      before: { stage: c.stage },
      after: { stage: to },
    });
  });
}

/** Nova versão imutável (V+1) com arquivos e copy. Em "Alteração", volta para revisão interna. */
export async function addVersion(
  ctx: Ctx,
  id: string,
  input: { fileIds: string[]; hook?: string; caption?: string; cta?: string; note?: string },
) {
  return command('content.addVersion', ctx, async (kit) => {
    const { tx } = kit;
    const c = await getContentRow(tx, id);
    assertCan(ctx, 'conteudo.create', contentRes(c));
    if (['approved', 'scheduled', 'posted', 'client_approval'].includes(c.stage))
      throw badRequest('Não é possível subir versão nesta etapa.');
    const number = c.currentVersion + 1;
    const [v] = await tx
      .insert(s.contentVersions)
      .values({
        workspaceId: ctx.workspaceId,
        contentId: id,
        number,
        note: input.note,
        createdBy: ctx.userId,
      })
      .returning();
    await tx.insert(s.contentCopies).values({
      workspaceId: ctx.workspaceId,
      versionId: v!.id,
      hook: input.hook,
      caption: input.caption,
      cta: input.cta,
    });
    if (input.fileIds.length)
      await tx.insert(s.contentAssets).values(
        input.fileIds.map((fileId, position) => ({
          workspaceId: ctx.workspaceId,
          versionId: v!.id,
          fileId,
          position,
        })),
      );
    await tx
      .update(s.contents)
      .set({ currentVersion: number, updatedAt: new Date() })
      .where(eq(s.contents.id, id));
    if (c.stage === 'change_requested')
      await stageChange(kit, c, 'internal_review', ctx.memberId, `V${number} enviada`);
    await kit.audit({
      action: 'content.version_uploaded',
      entityType: 'content',
      entityId: id,
      after: { version: number, files: input.fileIds.length },
    });
    await kit.emit({
      type: 'content.version_uploaded',
      entityType: 'content',
      entityId: id,
      payload: { contentId: id, version: number },
    });
    return v!;
  });
}

/**
 * Prévia do feed: ordenada por scheduled_at decrescente. Reordenar troca as DATAS entre os conteúdos
 * (a ordem nova recebe as mesmas datas já agendadas, na mesma sequência).
 */
export async function reorderFeed(ctx: Ctx, clientId: string, orderedIds: string[]) {
  assertCan(ctx, 'conteudo.create', { clientId });
  return command('content.reorderFeed', ctx, async (kit) => {
    const rows = await kit.tx
      .select()
      .from(s.contents)
      .where(
        and(
          eq(s.contents.clientId, clientId),
          inArray(s.contents.id, orderedIds),
          isNotNull(s.contents.scheduledAt),
        ),
      );
    if (rows.length !== orderedIds.length) throw badRequest('Só conteúdos agendados entram na reordenação.');
    const dates = rows.map((r) => r.scheduledAt!).sort((a, b) => b.getTime() - a.getTime());
    for (const [i, cid] of orderedIds.entries()) {
      const before = rows.find((r) => r.id === cid)!;
      if (before.scheduledAt!.getTime() === dates[i]!.getTime()) continue;
      await kit.tx
        .update(s.contents)
        .set({ scheduledAt: dates[i]!, updatedAt: new Date() })
        .where(eq(s.contents.id, cid));
      await kit.audit({
        action: 'content.rescheduled',
        entityType: 'content',
        entityId: cid,
        before: { scheduledAt: before.scheduledAt!.toISOString() },
        after: { scheduledAt: dates[i]!.toISOString() },
      });
    }
  });
}

export async function listCampaigns(ctx: Ctx, clientId?: string) {
  assertCan(ctx, 'conteudo.view');
  return read(ctx, (tx) =>
    tx
      .select({
        c: s.campaigns,
        client: s.clients.name,
        n: sql<number>`(select count(*)::int from contents where campaign_id = ${s.campaigns.id})`,
      })
      .from(s.campaigns)
      .innerJoin(s.clients, eq(s.clients.id, s.campaigns.clientId))
      .where(
        and(
          clientId ? eq(s.campaigns.clientId, clientId) : undefined,
          scopeWhere(ctx, 'conteudo.view', { client: s.campaigns.clientId }),
        ),
      )
      .orderBy(desc(s.campaigns.startsOn)),
  );
}
