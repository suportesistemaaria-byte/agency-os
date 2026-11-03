import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema as s, type Tx } from '@aos/db';
import type { CommandKit } from '@aos/core';
import { calculateDueAt } from '@aos/sla';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, forbidden, must } from './errors';
import { scopeWhere } from './scope';
import { getContentRow, stageChange } from './content';
import { loadCalendar } from './sla-clock';

/** Prazo de resposta do cliente para considerar a aprovação "atrasada" (calculado pelo @aos/sla). */
export const CLIENT_APPROVAL_POLICY = { model: 'business_days', amount: 2, rule: 'A1_same_time' } as const;

async function currentVersion(tx: Tx, contentId: string, number: number) {
  const [v] = await tx
    .select()
    .from(s.contentVersions)
    .where(and(eq(s.contentVersions.contentId, contentId), eq(s.contentVersions.number, number)));
  return must(v, 'O conteúdo ainda não tem versão.');
}

/** Ator da aprovação: membro da equipe ou contato do cliente (portal). */
export type Approver = { kind: 'member'; memberId: string } | { kind: 'contact'; contactId: string };

async function record(
  kit: CommandKit,
  contentId: string,
  versionId: string,
  action: (typeof s.approvalAction.enumValues)[number],
  by: Approver,
  origin: string,
  justification?: string,
) {
  await kit.tx.insert(s.contentApprovals).values({
    workspaceId: kit.ctx.workspaceId,
    contentId,
    versionId,
    action,
    actorMemberId: by.kind === 'member' ? by.memberId : null,
    actorContactId: by.kind === 'contact' ? by.contactId : null,
    origin,
    justification,
  });
}

/** Revisão interna → Aprovação do cliente: registra o envio e notifica os contatos que aprovam. */
export async function submitForApproval(ctx: Ctx, contentId: string) {
  return command('approvals.submit', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, contentId);
    assertCan(ctx, 'conteudo.create', { clientId: c.clientId, ownerMemberIds: [c.ownerId] });
    if (c.stage !== 'internal_review')
      throw badRequest('Só conteúdos em revisão interna podem ser enviados ao cliente.');
    const v = await currentVersion(kit.tx, contentId, c.currentVersion);
    const assets = await kit.tx.select().from(s.contentAssets).where(eq(s.contentAssets.versionId, v.id));
    if (!assets.length) throw badRequest('A versão enviada precisa ter ao menos um arquivo.');
    await record(kit, contentId, v.id, 'submitted', { kind: 'member', memberId: ctx.memberId }, 'internal');
    await stageChange(kit, c, 'client_approval', ctx.memberId, `V${v.number} enviada ao cliente`);
    await kit.audit({
      action: 'content.submitted',
      entityType: 'content',
      entityId: contentId,
      after: { version: v.number },
    });
    await kit.emit({
      type: 'content.submitted',
      entityType: 'content',
      entityId: contentId,
      payload: { contentId, version: v.number },
    });
  });
}

/** Revisão interna → volta para produção (pedido de ajuste interno, sem envolver o cliente). */
export async function requestInternalAdjust(ctx: Ctx, contentId: string, note: string) {
  return command('approvals.internalAdjust', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, contentId);
    assertCan(ctx, 'conteudo.create', { clientId: c.clientId, ownerMemberIds: [c.ownerId] });
    if (c.stage !== 'internal_review') throw badRequest('Só em revisão interna.');
    await stageChange(kit, c, 'design', ctx.memberId, note || 'Ajuste interno');
  });
}

async function approveIn(
  kit: CommandKit,
  contentId: string,
  by: Approver,
  origin: string,
  justification?: string,
) {
  const c = await getContentRow(kit.tx, contentId);
  if (c.stage !== 'client_approval') throw badRequest(`"${c.title}" não está aguardando aprovação.`);
  const v = await currentVersion(kit.tx, contentId, c.currentVersion);
  const onBehalf = by.kind === 'member';
  if (onBehalf && (justification ?? '').trim().length < 10)
    throw badRequest('Aprovação em nome do cliente exige justificativa (mínimo 10 caracteres).');
  await record(
    kit,
    contentId,
    v.id,
    onBehalf ? 'approved_on_behalf' : 'approved',
    by,
    origin,
    justification?.trim(),
  );
  await stageChange(
    kit,
    c,
    'approved',
    onBehalf ? by.memberId : null,
    onBehalf ? `Aprovado em nome do cliente: ${justification}` : 'Aprovado pelo cliente',
  );
  await kit.audit({
    action: onBehalf ? 'content.approved_on_behalf' : 'content.approved',
    entityType: 'content',
    entityId: contentId,
    before: { stage: c.stage },
    after: { stage: 'approved', version: v.number },
    metadata: { origin, ...(onBehalf ? { reason: justification } : {}) },
  });
  await kit.emit({
    type: onBehalf ? 'content.approved_on_behalf' : 'content.approved',
    entityType: 'content',
    entityId: contentId,
    payload: { contentId, version: v.number },
  });
}

/** Aprovação em nome do cliente: exige conteudo.approve_on_behalf e justificativa, registrada na auditoria. */
export async function approveOnBehalf(ctx: Ctx, contentIds: string[], justification: string) {
  assertCan(ctx, 'conteudo.approve_on_behalf');
  if (!contentIds.length) throw badRequest('Selecione ao menos um conteúdo.');
  return command('approvals.approveOnBehalf', ctx, async (kit) => {
    for (const id of contentIds)
      await approveIn(kit, id, { kind: 'member', memberId: ctx.memberId }, 'internal', justification);
  });
}

export interface ChangeRequestInput {
  comment?: string;
  annotations?: { assetIndex?: number; xPct?: number; yPct?: number; videoMs?: number; body: string }[];
}

async function requestChangeIn(
  kit: CommandKit,
  contentId: string,
  by: Approver,
  origin: string,
  input: ChangeRequestInput,
) {
  const c = await getContentRow(kit.tx, contentId);
  if (c.stage !== 'client_approval')
    throw badRequest('Só é possível pedir alteração de conteúdo em aprovação.');
  if (!input.comment?.trim() && !input.annotations?.length)
    throw badRequest('Descreva a alteração (comentário ou marcação na arte).');
  const v = await currentVersion(kit.tx, contentId, c.currentVersion);
  const author = {
    authorMemberId: by.kind === 'member' ? by.memberId : null,
    authorContactId: by.kind === 'contact' ? by.contactId : null,
  };
  if (input.comment?.trim())
    await kit.tx.insert(s.contentComments).values({
      workspaceId: kit.ctx.workspaceId,
      contentId,
      versionId: v.id,
      visibility: 'client',
      body: input.comment.trim(),
      ...author,
    });
  for (const a of input.annotations ?? [])
    await kit.tx.insert(s.contentAnnotations).values({
      workspaceId: kit.ctx.workspaceId,
      contentId,
      versionId: v.id,
      assetIndex: a.assetIndex ?? 0,
      xPct: a.xPct !== undefined ? String(a.xPct) : null,
      yPct: a.yPct !== undefined ? String(a.yPct) : null,
      videoMs: a.videoMs ?? null,
      body: a.body,
      ...author,
    });
  await record(kit, contentId, v.id, 'change_requested', by, origin, input.comment);
  await stageChange(kit, c, 'change_requested', by.kind === 'member' ? by.memberId : null, input.comment);
  await kit.audit({
    action: 'content.change_requested',
    entityType: 'content',
    entityId: contentId,
    before: { stage: c.stage },
    after: { stage: 'change_requested', version: v.number, annotations: input.annotations?.length ?? 0 },
    metadata: { origin },
  });
  await kit.emit({
    type: 'content.change_requested',
    entityType: 'content',
    entityId: contentId,
    payload: { contentId, version: v.number, clientId: c.clientId },
  });
}

/** Pedido de alteração registrado pela equipe em nome do cliente (ex.: recebido por WhatsApp). */
export async function requestChange(ctx: Ctx, contentId: string, input: ChangeRequestInput) {
  return command('approvals.requestChange', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, contentId);
    assertCan(ctx, 'conteudo.create', { clientId: c.clientId, ownerMemberIds: [c.ownerId] });
    await requestChangeIn(kit, contentId, { kind: 'member', memberId: ctx.memberId }, 'internal', input);
  });
}

/** Contato do cliente (portal): aprova ou pede alteração conforme as flags dele. */
export async function contactDecision(
  ctx: Ctx,
  contactId: string,
  contentIds: string[],
  decision: { approve: true } | { approve: false; change: ChangeRequestInput },
) {
  return command('approvals.contactDecision', ctx, async (kit) => {
    const [ct] = await kit.tx.select().from(s.clientContacts).where(eq(s.clientContacts.id, contactId));
    const contact = must(ct, 'Contato não encontrado.');
    for (const id of contentIds) {
      const c = await getContentRow(kit.tx, id);
      if (c.clientId !== contact.clientId) throw forbidden();
      if (decision.approve) {
        if (!contact.canApprove) throw forbidden('Este contato não tem permissão para aprovar.');
        await approveIn(kit, id, { kind: 'contact', contactId }, 'portal');
      } else {
        if (!contact.canComment) throw forbidden('Este contato não tem permissão para comentar.');
        await requestChangeIn(kit, id, { kind: 'contact', contactId }, 'portal', decision.change);
      }
    }
  });
}

export async function addComment(
  ctx: Ctx,
  contentId: string,
  body: string,
  visibility: 'internal' | 'client' = 'internal',
) {
  if (!body.trim()) throw badRequest('Comentário vazio.');
  return command('approvals.comment', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, contentId);
    assertCan(ctx, 'conteudo.view', {
      clientId: c.clientId,
      ownerMemberIds: [c.ownerId, c.designerId, c.copywriterId],
    });
    const v = await currentVersion(kit.tx, contentId, c.currentVersion);
    await kit.tx.insert(s.contentComments).values({
      workspaceId: ctx.workspaceId,
      contentId,
      versionId: v.id,
      authorMemberId: ctx.memberId,
      visibility,
      body: body.trim(),
    });
    await kit.emit({
      type: 'comment.created',
      entityType: 'content',
      entityId: contentId,
      payload: { contentId, versionId: v.id },
    });
  });
}

export async function addAnnotation(
  ctx: Ctx,
  contentId: string,
  versionNumber: number,
  a: { assetIndex?: number; xPct?: number; yPct?: number; videoMs?: number; body: string },
) {
  if (!a.body.trim()) throw badRequest('Escreva a observação da marcação.');
  return command('approvals.annotate', ctx, async (kit) => {
    const c = await getContentRow(kit.tx, contentId);
    assertCan(ctx, 'conteudo.view', {
      clientId: c.clientId,
      ownerMemberIds: [c.ownerId, c.designerId, c.copywriterId],
    });
    const v = await currentVersion(kit.tx, contentId, versionNumber);
    await kit.tx.insert(s.contentAnnotations).values({
      workspaceId: ctx.workspaceId,
      contentId,
      versionId: v.id,
      assetIndex: a.assetIndex ?? 0,
      xPct: a.xPct !== undefined ? String(a.xPct) : null,
      yPct: a.yPct !== undefined ? String(a.yPct) : null,
      videoMs: a.videoMs ?? null,
      body: a.body.trim(),
      authorMemberId: ctx.memberId,
    });
    await kit.emit({
      type: 'annotation.created',
      entityType: 'content',
      entityId: contentId,
      payload: { contentId, versionId: v.id },
    });
  });
}

export type ApprovalTab = 'waiting' | 'changes' | 'approved' | 'late';

/** Central de aprovações: Aguardando, Alteração, Aprovado e Atrasado (prazo de resposta pelo @aos/sla). */
export async function approvalCenter(ctx: Ctx, clientId?: string) {
  assertCan(ctx, 'conteudo.view');
  return read(ctx, async (tx) => {
    const conds = [
      isNull(s.contents.deletedAt),
      inArray(s.contents.stage, ['client_approval', 'change_requested', 'approved']),
    ];
    const sc = scopeWhere(ctx, 'conteudo.view', {
      client: s.contents.clientId,
      owners: [s.contents.ownerId, s.contents.designerId, s.contents.copywriterId],
    });
    if (sc) conds.push(sc);
    if (clientId) conds.push(eq(s.contents.clientId, clientId));
    const rows = await tx
      .select({ c: s.contents, client: s.clients.name, clientColor: s.clients.color })
      .from(s.contents)
      .innerJoin(s.clients, eq(s.clients.id, s.contents.clientId))
      .where(and(...conds))
      .orderBy(desc(s.contents.updatedAt));
    const ids = rows.map((r) => r.c.id);
    const submitted = ids.length
      ? await tx
          .select({
            contentId: s.contentApprovals.contentId,
            at: sql<Date>`max(${s.contentApprovals.createdAt})`,
          })
          .from(s.contentApprovals)
          .where(and(inArray(s.contentApprovals.contentId, ids), eq(s.contentApprovals.action, 'submitted')))
          .groupBy(s.contentApprovals.contentId)
      : [];
    const thumbs = ids.length
      ? await tx
          .select({
            contentId: s.contentVersions.contentId,
            fileId: s.contentAssets.fileId,
            mime: s.files.mime,
            caption: s.contentCopies.caption,
          })
          .from(s.contentVersions)
          .innerJoin(
            s.contents,
            and(
              eq(s.contents.id, s.contentVersions.contentId),
              eq(s.contents.currentVersion, s.contentVersions.number),
            ),
          )
          .leftJoin(
            s.contentAssets,
            and(eq(s.contentAssets.versionId, s.contentVersions.id), eq(s.contentAssets.position, 0)),
          )
          .leftJoin(s.files, eq(s.files.id, s.contentAssets.fileId))
          .leftJoin(s.contentCopies, eq(s.contentCopies.versionId, s.contentVersions.id))
          .where(inArray(s.contentVersions.contentId, ids))
      : [];
    const cal = await loadCalendar(tx);
    const now = new Date();
    const items = rows.map((r) => {
      const sub = submitted.find((x) => x.contentId === r.c.id)?.at;
      let late = false;
      let dueAt: Date | null = null;
      if (r.c.stage === 'client_approval' && sub) {
        const res = calculateDueAt({
          calendar: cal,
          policy: CLIENT_APPROVAL_POLICY,
          createdAt: new Date(sub),
          now,
        });
        late = res.status === 'OVERDUE';
        dueAt = res.dueAt;
      }
      const th = thumbs.find((t) => t.contentId === r.c.id);
      return {
        ...r.c,
        clientName: r.client,
        clientColor: r.clientColor,
        submittedAt: sub ? new Date(sub) : null,
        responseDueAt: dueAt,
        late,
        thumbFileId: th?.fileId ?? null,
        thumbMime: th?.mime ?? null,
        caption: th?.caption ?? null,
      };
    });
    return {
      waiting: items.filter((i) => i.stage === 'client_approval'),
      changes: items.filter((i) => i.stage === 'change_requested'),
      approved: items.filter((i) => i.stage === 'approved'),
      late: items.filter((i) => i.late),
    };
  });
}
