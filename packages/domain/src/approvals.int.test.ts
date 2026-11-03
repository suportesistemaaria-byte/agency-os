import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { adminDb, appDb, closeAll, schema as s, withTenant } from '@aos/db';
import { addVersion, createContent, moveContentStage } from './content';
import { approveOnBehalf, requestChange, submitForApproval } from './approvals';
import { uploadFile } from './files';
import { drainOutbox } from './dispatcher';
import { tenant, type Ctx } from './context';
import { clientIdByName, ctxOf, hasDb, uniq } from './test-helpers';
import { PNG } from './flows.int-helpers';

const db = () => adminDb();

describe.skipIf(!hasDb())('conteúdo, versões e aprovações', () => {
  let ctx: Ctx;
  let terraMar = '';
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    terraMar = await clientIdByName('Terra Mar');
  });
  afterAll(closeAll);

  async function inApproval(title = uniq('Post aprovação')) {
    const c = await createContent(ctx, { clientId: terraMar, title, platform: 'Instagram', format: 'Post' });
    const f = await uploadFile(ctx, {
      name: 'arte.png',
      bytes: PNG,
      clientId: terraMar,
      link: { entityType: 'content', entityId: c.id },
    });
    await addVersion(ctx, c.id, { fileIds: [f.id], caption: 'Legenda V1' });
    await moveContentStage(ctx, c.id, 'internal_review');
    await submitForApproval(ctx, c.id);
    return c;
  }

  it('revisão interna exige versão com arquivo; versões são imutáveis', async () => {
    const c = await createContent(ctx, {
      clientId: terraMar,
      title: uniq('Sem versão'),
      platform: 'Instagram',
      format: 'Post',
    });
    await expect(moveContentStage(ctx, c.id, 'internal_review')).rejects.toThrow(/versão/);
    const a = await inApproval();
    const [v] = await db().select().from(s.contentVersions).where(eq(s.contentVersions.contentId, a.id));
    await expect(
      withTenant(appDb(), tenant(ctx), (tx) =>
        tx.execute(sql`update content_versions set note = 'x' where id = ${v!.id}`),
      ),
    ).rejects.toThrow();
    await expect(
      db().execute(sql`update content_versions set note = 'x' where id = ${v!.id}`),
    ).rejects.toThrow(/imutável/);
  });

  it('aprovação em nome do cliente exige permissão e justificativa, e vai para a auditoria', async () => {
    const c = await inApproval();
    await expect(
      approveOnBehalf(await ctxOf('bia@demo.local'), [c.id], 'Cliente aprovou no WhatsApp'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(approveOnBehalf(ctx, [c.id], 'ok')).rejects.toThrow(/justificativa/);
    await approveOnBehalf(ctx, [c.id], 'Cliente aprovou por WhatsApp às 14h.');
    const [ap] = await db()
      .select()
      .from(s.contentApprovals)
      .where(
        and(eq(s.contentApprovals.contentId, c.id), eq(s.contentApprovals.action, 'approved_on_behalf')),
      );
    expect(ap).toMatchObject({
      justification: 'Cliente aprovou por WhatsApp às 14h.',
      actorMemberId: ctx.memberId,
    });
    const [v1] = await db().select().from(s.contentVersions).where(eq(s.contentVersions.contentId, c.id));
    expect(ap!.versionId).toBe(v1!.id);
    const [log] = await db()
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.entityId, c.id), eq(s.auditLogs.action, 'content.approved_on_behalf')));
    expect((log!.metadata as { reason: string }).reason).toMatch(/WhatsApp/);
    // o banco também recusa aprovação em nome sem justificativa
    await expect(
      withTenant(appDb(), tenant(ctx), (tx) =>
        tx.insert(s.contentApprovals).values({
          workspaceId: ctx.workspaceId,
          contentId: c.id,
          versionId: v1!.id,
          action: 'approved_on_behalf',
          actorMemberId: ctx.memberId,
        }),
      ),
    ).rejects.toThrow(/check/i);
  });

  it('alteração pedida cria tarefa com SLA de Alteração para o designer padrão; V2 não sobrescreve V1', async () => {
    const c = await inApproval();
    await requestChange(ctx, c.id, {
      comment: 'Trocar a foto',
      annotations: [{ xPct: 40, yPct: 60, body: 'Esta foto' }],
    });
    await drainOutbox();
    await drainOutbox();
    const tasks = await db()
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.contentId, c.id), eq(s.tasks.originType, 'content_change')));
    expect(tasks).toHaveLength(1);
    const [team] = await db()
      .select()
      .from(s.clientTeam)
      .where(and(eq(s.clientTeam.clientId, terraMar), eq(s.clientTeam.function, 'design')));
    expect(tasks[0]!.assigneeId).toBe(team!.memberId);
    const [clk] = await db().select().from(s.slaClocks).where(eq(s.slaClocks.id, tasks[0]!.slaClockId!));
    expect(clk!.policyKey).toBe('alteracao');
    const [ann] = await db()
      .select()
      .from(s.contentAnnotations)
      .where(eq(s.contentAnnotations.contentId, c.id));
    expect(Number(ann!.xPct)).toBe(40);
    const f = await uploadFile(ctx, { name: 'v2.png', bytes: PNG, clientId: terraMar });
    await addVersion(ctx, c.id, { fileIds: [f.id], caption: 'Legenda V2' });
    const versions = await db().select().from(s.contentVersions).where(eq(s.contentVersions.contentId, c.id));
    expect(versions.map((v) => v.number).sort()).toEqual([1, 2]);
    const [content] = await db().select().from(s.contents).where(eq(s.contents.id, c.id));
    expect(content).toMatchObject({ stage: 'internal_review', currentVersion: 2 });
    const copies = await db().select().from(s.contentCopies);
    expect(copies.find((x) => x.versionId === versions.find((v) => v.number === 1)!.id)!.caption).toBe(
      'Legenda V1',
    );
  });

  it('aprovação em lote é atômica: um item inválido cancela o lote inteiro', async () => {
    const a = await inApproval();
    const b = await inApproval();
    const draft = await createContent(ctx, {
      clientId: terraMar,
      title: uniq('Rascunho'),
      platform: 'Instagram',
      format: 'Post',
    });
    await expect(
      approveOnBehalf(ctx, [a.id, b.id, draft.id], 'Aprovação em reunião com o cliente.'),
    ).rejects.toThrow();
    const st = await db()
      .select()
      .from(s.contents)
      .where(sql`${s.contents.id} in (${a.id}, ${b.id})`);
    expect(st.every((x) => x.stage === 'client_approval')).toBe(true);
    await approveOnBehalf(ctx, [a.id, b.id], 'Aprovação em reunião com o cliente.');
    const st2 = await db()
      .select()
      .from(s.contents)
      .where(sql`${s.contents.id} in (${a.id}, ${b.id})`);
    expect(st2.every((x) => x.stage === 'approved')).toBe(true);
  });
});
