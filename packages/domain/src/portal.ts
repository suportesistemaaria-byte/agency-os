import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { adminDb, schema as s } from '@aos/db';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, forbidden, must } from './errors';
import { contactDecision, type ChangeRequestInput } from './approvals';
import { createRequestIn, type CreateRequestInput } from './requests';
import { liveStatuses } from './sla-clock';
import { storage } from './storage';

/** Contexto do portal: um contato de um cliente. Sem permissões internas (perms vazio). */
export interface PortalCtx extends Ctx {
  clientId: string;
  contactId: string;
  flags: {
    canView: boolean;
    canComment: boolean;
    canRequest: boolean;
    canApprove: boolean;
    receivesFinance: boolean;
    receivesNotifications: boolean;
  };
  clientName: string;
  agencyName: string;
  sessionCreatedAt?: Date;
}

/** Resolve o contato do usuário (identidade é global; mesmo limite do login). */
export async function loadPortalCtx(userId: string, requestId?: string): Promise<PortalCtx | null> {
  const [row] = await adminDb()
    .select({ contact: s.clientContacts, client: s.clients, person: s.people, ws: s.workspaces })
    .from(s.clientContacts)
    .innerJoin(s.clients, eq(s.clients.id, s.clientContacts.clientId))
    .innerJoin(s.people, eq(s.people.id, s.clientContacts.personId))
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.clientContacts.workspaceId))
    .where(and(eq(s.clientContacts.userId, userId), isNull(s.clients.deletedAt)));
  if (!row || !row.contact.canView || row.client.status === 'churned') return null;
  const c = row.contact;
  return {
    workspaceId: row.ws.id,
    userId,
    memberId: '00000000-0000-0000-0000-000000000000',
    actorType: 'client_contact',
    requestId,
    perms: new Map(),
    teamClientIds: new Set(),
    name: row.person.name,
    email: row.person.email ?? '',
    roleKeys: [],
    timezone: row.ws.timezone,
    clientId: row.client.id,
    contactId: c.id,
    portalFinance: c.receivesFinance,
    flags: {
      canView: c.canView,
      canComment: c.canComment,
      canRequest: c.canRequest,
      canApprove: c.canApprove,
      receivesFinance: c.receivesFinance,
      receivesNotifications: c.receivesNotifications,
    },
    clientName: row.client.name,
    agencyName: row.ws.name,
  };
}

// ───────────────────────── Convite do contato (equipe) ─────────────────────────

export async function createPortalInvite(ctx: Ctx, contactId: string) {
  return command('portal.invite', ctx, async (kit) => {
    const [ct] = await kit.tx
      .select({ c: s.clientContacts, p: s.people })
      .from(s.clientContacts)
      .innerJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.clientContacts.id, contactId));
    const row = must(ct, 'Contato não encontrado.');
    assertCan(ctx, 'clientes.edit', { clientId: row.c.clientId });
    if (!row.p.email) throw badRequest('O contato precisa de e-mail para acessar o portal.');
    if (row.c.userId) throw badRequest('Este contato já tem acesso ao portal.');
    const [inv] = await kit.tx
      .insert(s.invitations)
      .values({
        workspaceId: ctx.workspaceId,
        email: row.p.email.toLowerCase(),
        name: row.p.name,
        kind: 'portal',
        contactId,
        roleKeys: [],
        token: randomBytes(24).toString('base64url'),
        invitedBy: ctx.memberId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning();
    await kit.audit({
      action: 'portal.invited',
      entityType: 'client_contact',
      entityId: contactId,
      after: { email: row.p.email },
    });
    await kit.emit({
      type: 'member.invited',
      entityType: 'invitation',
      entityId: inv!.id,
      payload: { email: row.p.email, roleKeys: [] },
    });
    return inv!;
  });
}

// ───────────────────────── Leitura (sempre sob RLS do cliente) ─────────────────────────

const VISIBLE = ['client_approval', 'change_requested', 'approved', 'scheduled', 'posted'] as const;

export async function portalContents(ctx: PortalCtx) {
  return read(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(s.contents)
      .where(
        and(
          eq(s.contents.clientId, ctx.clientId),
          inArray(s.contents.stage, [...VISIBLE]),
          isNull(s.contents.deletedAt),
        ),
      )
      .orderBy(asc(s.contents.scheduledAt));
    const ids = rows.map((r) => r.id);
    const thumbs = ids.length
      ? await tx
          .select({
            contentId: s.contentVersions.contentId,
            number: s.contentVersions.number,
            fileId: s.contentAssets.fileId,
            mime: s.files.mime,
            caption: s.contentCopies.caption,
          })
          .from(s.contentVersions)
          .leftJoin(
            s.contentAssets,
            and(eq(s.contentAssets.versionId, s.contentVersions.id), eq(s.contentAssets.position, 0)),
          )
          .leftJoin(s.files, eq(s.files.id, s.contentAssets.fileId))
          .leftJoin(s.contentCopies, eq(s.contentCopies.versionId, s.contentVersions.id))
          .where(inArray(s.contentVersions.contentId, ids))
      : [];
    return rows.map((r) => {
      const t = thumbs.filter((x) => x.contentId === r.id && x.number === r.currentVersion)[0];
      return {
        ...r,
        thumbFileId: t?.fileId ?? null,
        thumbMime: t?.mime ?? null,
        caption: t?.caption ?? null,
      };
    });
  });
}

export async function portalContent(ctx: PortalCtx, id: string) {
  return read(ctx, async (tx) => {
    const [c] = await tx.select().from(s.contents).where(eq(s.contents.id, id));
    const content = must(c, 'Conteúdo não encontrado.');
    const versions = await tx
      .select()
      .from(s.contentVersions)
      .where(eq(s.contentVersions.contentId, id))
      .orderBy(desc(s.contentVersions.number));
    const v = versions.find((x) => x.number === content.currentVersion) ?? versions[0];
    const assets = v
      ? await tx
          .select({ fileId: s.contentAssets.fileId, mime: s.files.mime, position: s.contentAssets.position })
          .from(s.contentAssets)
          .innerJoin(s.files, eq(s.files.id, s.contentAssets.fileId))
          .where(eq(s.contentAssets.versionId, v.id))
          .orderBy(asc(s.contentAssets.position))
      : [];
    const [copy] = v
      ? await tx.select().from(s.contentCopies).where(eq(s.contentCopies.versionId, v.id))
      : [];
    const comments = await tx
      .select({ c: s.contentComments, contact: s.people.name })
      .from(s.contentComments)
      .leftJoin(s.clientContacts, eq(s.clientContacts.id, s.contentComments.authorContactId))
      .leftJoin(s.people, eq(s.people.id, s.clientContacts.personId))
      .where(eq(s.contentComments.contentId, id))
      .orderBy(asc(s.contentComments.createdAt));
    const annotations = v
      ? await tx.select().from(s.contentAnnotations).where(eq(s.contentAnnotations.versionId, v.id))
      : [];
    const approvals = await tx
      .select()
      .from(s.contentApprovals)
      .where(eq(s.contentApprovals.contentId, id))
      .orderBy(desc(s.contentApprovals.createdAt));
    return {
      content,
      version: v ?? null,
      assets,
      copy: copy ?? null,
      // nomes da equipe interna não aparecem no portal
      comments: comments.map((x) => ({
        id: x.c.id,
        body: x.c.body,
        at: x.c.createdAt,
        author: x.contact ?? `Equipe ${ctx.agencyName}`,
      })),
      annotations,
      approvals,
    };
  });
}

export async function portalRequests(ctx: PortalCtx) {
  return read(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(s.requests)
      .where(eq(s.requests.clientId, ctx.clientId))
      .orderBy(desc(s.requests.createdAt));
    const sla = await liveStatuses(
      tx,
      rows.map((r) => r.slaClockId),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt,
      sla: r.slaClockId ? (sla.get(r.slaClockId) ?? null) : null,
    }));
  });
}

export async function portalMeetings(ctx: PortalCtx) {
  return read(ctx, (tx) =>
    tx
      .select({
        id: s.meetings.id,
        title: s.meetings.title,
        startsAt: s.meetings.startsAt,
        location: s.meetings.location,
      })
      .from(s.meetings)
      .where(
        and(
          eq(s.meetings.clientId, ctx.clientId),
          gte(s.meetings.startsAt, new Date(Date.now() - 60 * 86_400_000)),
        ),
      )
      .orderBy(asc(s.meetings.startsAt)),
  );
}

export async function portalFiles(ctx: PortalCtx) {
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.files)
      .where(and(eq(s.files.clientId, ctx.clientId), isNull(s.files.deletedAt)))
      .orderBy(desc(s.files.createdAt)),
  );
}

export async function portalInvoices(ctx: PortalCtx) {
  if (!ctx.flags.receivesFinance) return [];
  return read(ctx, (tx) =>
    tx
      .select()
      .from(s.invoices)
      .where(and(eq(s.invoices.clientId, ctx.clientId), isNull(s.invoices.deletedAt)))
      .orderBy(desc(s.invoices.dueOn))
      .limit(24),
  );
}

export async function portalHome(ctx: PortalCtx) {
  const [contents, requests, meetings] = await Promise.all([
    portalContents(ctx),
    portalRequests(ctx),
    portalMeetings(ctx),
  ]);
  const now = new Date();
  return {
    waiting: contents.filter((c) => c.stage === 'client_approval'),
    upcoming: contents
      .filter((c) => ['approved', 'scheduled'].includes(c.stage) && c.scheduledAt && c.scheduledAt > now)
      .slice(0, 6),
    requests: requests.filter((r) => !['delivered', 'cancelled'].includes(r.status)),
    meetings: meetings.filter((m) => m.startsAt > now).slice(0, 3),
  };
}

/** Arquivo para o portal: só o que a RLS do cliente deixa enxergar. */
export async function portalReadFile(ctx: PortalCtx, fileId: string) {
  const f = await read(ctx, async (tx) => (await tx.select().from(s.files).where(eq(s.files.id, fileId)))[0]);
  if (!f) throw forbidden();
  return { file: f, bytes: await storage().get(f.storageKey) };
}

// ───────────────────────── Ações do contato ─────────────────────────

/** "30 dias, com reautenticação para aprovar" (decisão 7 da V3): a aprovação exige sessão recente. */
export const PORTAL_REAUTH_MS = 12 * 3600_000;

export async function portalApprove(ctx: PortalCtx, contentIds: string[]) {
  if (!ctx.flags.canApprove) throw forbidden('Seu acesso não permite aprovar. Fale com a agência.');
  if (ctx.sessionCreatedAt && Date.now() - ctx.sessionCreatedAt.getTime() > PORTAL_REAUTH_MS)
    throw badRequest('REAUTH: confirme sua senha para aprovar.');
  return contactDecision(ctx, ctx.contactId, contentIds, { approve: true });
}

export async function portalRequestChange(ctx: PortalCtx, contentId: string, change: ChangeRequestInput) {
  if (!ctx.flags.canComment) throw forbidden('Seu acesso não permite pedir alterações.');
  return contactDecision(ctx, ctx.contactId, [contentId], { approve: false, change });
}

export async function portalCreateRequest(
  ctx: PortalCtx,
  input: Omit<CreateRequestInput, 'clientId' | 'origin' | 'requestedByContactId'>,
) {
  if (!ctx.flags.canRequest) throw forbidden('Seu acesso não permite abrir solicitações.');
  return command('portal.createRequest', ctx, (kit) =>
    createRequestIn(kit, {
      ...input,
      inScope: true,
      clientId: ctx.clientId,
      origin: 'portal',
      requestedByContactId: ctx.contactId,
    }),
  );
}

/** Usuário só de portal (sem vínculo de equipe): sessão de 30 dias (decisão 7 da V3). */
export async function isPortalOnlyUser(userId: string): Promise<boolean> {
  const db = adminDb();
  const m = await db
    .select({ id: s.workspaceMembers.id })
    .from(s.workspaceMembers)
    .where(eq(s.workspaceMembers.userId, userId))
    .limit(1);
  if (m.length) return false;
  const c = await db
    .select({ id: s.clientContacts.id })
    .from(s.clientContacts)
    .where(eq(s.clientContacts.userId, userId))
    .limit(1);
  return c.length > 0;
}
