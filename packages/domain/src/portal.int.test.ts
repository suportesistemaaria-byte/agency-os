import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, appDb, closeAll, schema as s, withTenant } from '@aos/db';
import { addContact } from './clients';
import { createContent, addVersion, moveContentStage } from './content';
import { submitForApproval } from './approvals';
import { uploadFile } from './files';
import { addComment } from './approvals';
import { drainOutbox } from './dispatcher';
import {
  loadPortalCtx,
  portalApprove,
  portalContent,
  portalContents,
  portalCreateRequest,
  portalReadFile,
  portalRequestChange,
  type PortalCtx,
} from './portal';
import { tenant, type Ctx } from './context';
import { clientIdByName, ctxOf, hasDb, uniq } from './test-helpers';
import { PNG } from './flows.int-helpers';

const db = () => adminDb();

describe.skipIf(!hasDb())('portal do cliente: isolamento e ações do contato', () => {
  let ctx: Ctx;
  let terraMar = '';
  let cafe = '';
  let portal: PortalCtx;
  let viewer: PortalCtx;

  async function portalUser(flags: Record<string, boolean>) {
    const email = `${uniq('contato').replace(/\s/g, '')}@cliente.demo.local`;
    const contact = await addContact(ctx, terraMar, { name: uniq('Contato'), email, ...flags });
    const [u] = await db().insert(s.users).values({ email, name: 'Contato teste' }).returning();
    await db().update(s.clientContacts).set({ userId: u!.id }).where(eq(s.clientContacts.id, contact.id));
    return (await loadPortalCtx(u!.id))!;
  }
  async function inApproval(clientId: string) {
    const c = await createContent(ctx, {
      clientId,
      title: uniq('Post portal'),
      platform: 'Instagram',
      format: 'Post',
    });
    const f = await uploadFile(ctx, {
      name: 'a.png',
      bytes: PNG,
      clientId,
      link: { entityType: 'content', entityId: c.id },
    });
    await addVersion(ctx, c.id, { fileIds: [f.id], caption: 'Legenda' });
    await moveContentStage(ctx, c.id, 'internal_review');
    await submitForApproval(ctx, c.id);
    return { content: c, fileId: f.id };
  }

  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    terraMar = await clientIdByName('Terra Mar');
    cafe = await clientIdByName('Café Aurora');
    portal = await portalUser({ canApprove: true, canComment: true, canRequest: true });
    viewer = await portalUser({ canApprove: false, canComment: false, canRequest: false });
  });
  afterAll(closeAll);

  const asPortal = <T>(p: PortalCtx, fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(appDb(), tenant(p), fn);

  it('não vê outros clientes, nem dados comerciais, custos, tarefas internas, financeiro interno ou equipe', async () => {
    const clients = await asPortal(portal, (tx) => tx.select().from(s.clients));
    expect(clients.map((c) => c.id)).toEqual([terraMar]);
    const zero = {
      tasks: s.tasks,
      opportunities: s.opportunities,
      leads: s.leads,
      proposals: s.proposals,
      expenses: s.expenses,
      contracts: s.contracts,
      contractItems: s.contractItems,
      invoices: s.invoices,
      workspaceMembers: s.workspaceMembers,
      notifications: s.notifications,
      clientTeam: s.clientTeam,
      automationRules: s.automationRules,
      organizations: s.organizations,
      commercialActivities: s.commercialActivities,
      nextActions: s.nextActions,
      taskComments: s.taskComments,
    };
    for (const [name, table] of Object.entries(zero)) {
      const rows = await asPortal(portal, (tx) => tx.select().from(table as typeof s.tasks));
      expect({ name, n: rows.length }).toEqual({ name, n: 0 });
    }
    const users = await asPortal(portal, (tx) => tx.select().from(s.users));
    expect(users.every((u) => u.id === portal.userId)).toBe(true);
    const contents = await asPortal(portal, (tx) => tx.select().from(s.contents));
    expect(
      contents.every(
        (c) =>
          c.clientId === terraMar &&
          ['client_approval', 'change_requested', 'approved', 'scheduled', 'posted'].includes(c.stage),
      ),
    ).toBe(true);
  });

  it('notas internas não aparecem; comentários "visível ao cliente" sim', async () => {
    const { content } = await inApproval(terraMar);
    await addComment(ctx, content.id, 'Nota interna: margem apertada', 'internal');
    await addComment(ctx, content.id, 'Segue a versão para aprovação', 'client');
    const d = await portalContent(portal, content.id);
    expect(d.comments.map((c) => c.body)).toEqual(['Segue a versão para aprovação']);
    expect(d.comments[0]!.author).toMatch(/^Equipe /); // nome da equipe interna não aparece
  });

  it('faturas só para o contato que recebe financeiro, e só do próprio cliente', async () => {
    const fin = await portalUser({ receivesFinance: true });
    const inv = await asPortal(fin, (tx) => tx.select().from(s.invoices));
    expect(inv.length).toBeGreaterThan(0);
    expect(inv.every((i) => i.clientId === terraMar)).toBe(true);
    expect(await asPortal(portal, (tx) => tx.select().from(s.invoices))).toHaveLength(0);
  });

  it('não grava dados para outro cliente nem lê arquivo de outro cliente', async () => {
    await expect(
      asPortal(portal, (tx) =>
        tx
          .insert(s.requests)
          .values({ workspaceId: portal.workspaceId, clientId: cafe, type: 'outro', title: 'invasão' }),
      ),
    ).rejects.toThrow(/row-level security/);
    const other = await inApproval(cafe);
    await expect(portalReadFile(portal, other.fileId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await portalContents(portal)).some((c) => c.id === other.content.id)).toBe(false);
  });

  it('aprovação pelo portal respeita a flag e registra o contato como autor', async () => {
    const { content } = await inApproval(terraMar);
    await expect(portalApprove(viewer, [content.id])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      portalApprove({ ...portal, sessionCreatedAt: new Date(Date.now() - 13 * 3600_000) }, [content.id]),
    ).rejects.toThrow(/REAUTH/);
    await portalApprove({ ...portal, sessionCreatedAt: new Date() }, [content.id]);
    const [ap] = await db()
      .select()
      .from(s.contentApprovals)
      .where(and(eq(s.contentApprovals.contentId, content.id), eq(s.contentApprovals.action, 'approved')));
    expect(ap).toMatchObject({ actorContactId: portal.contactId, origin: 'portal', actorMemberId: null });
    const [log] = await db()
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityId, content.id), eq(s.auditLogs.action, 'content.approved')));
    expect(log!.actorType).toBe('client_contact');
  });

  it('alteração pelo portal cria tarefa com SLA para o designer padrão', async () => {
    const { content } = await inApproval(terraMar);
    await portalRequestChange(portal, content.id, {
      comment: 'Trocar a cor do fundo',
      annotations: [{ xPct: 10, yPct: 20, body: 'Aqui' }],
    });
    await drainOutbox();
    await drainOutbox();
    const tasks = await db()
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.contentId, content.id), eq(s.tasks.originType, 'content_change')));
    expect(tasks).toHaveLength(1);
    const [c] = await db().select().from(s.contents).where(eq(s.contents.id, content.id));
    expect(c!.stage).toBe('change_requested');
    await expect(portalRequestChange(viewer, content.id, { comment: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('solicitação pelo portal entra em triagem com SLA; sem a flag é recusada', async () => {
    const r = await portalCreateRequest(portal, { type: 'arte_estatica', title: uniq('Pedido do cliente') });
    const [row] = await db().select().from(s.requests).where(eq(s.requests.id, r.id));
    expect(row).toMatchObject({
      clientId: terraMar,
      origin: 'portal',
      status: 'triage',
      requestedByContactId: portal.contactId,
    });
    await expect(portalCreateRequest(viewer, { type: 'outro', title: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('contato sem "visualizar" não entra no portal', async () => {
    const blocked = await portalUser({ canView: false });
    expect(blocked).toBeNull();
  });
});
