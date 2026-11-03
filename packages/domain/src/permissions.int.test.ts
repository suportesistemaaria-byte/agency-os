import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import { getClient, portfolio } from './clients';
import { listTasks } from './tasks';
import { listContents } from './content';
import { setMemberStatus, setOverride } from './members';
import { loadCtx, type Ctx } from './context';
import { pipelineBoard } from './crm';
import { clientIdByName, ctxOf, hasDb } from './test-helpers';

describe.skipIf(!hasDb())('permissões (can + escopos) e isolamento entre workspaces nos serviços', () => {
  let admin: Ctx;
  let rafa: Ctx;
  let terraMar = '';
  let otica = '';
  beforeAll(async () => {
    admin = await ctxOf('manuella@demo.local');
    rafa = await ctxOf('rafa@demo.local');
    terraMar = await clientIdByName('Terra Mar');
    otica = await clientIdByName('Ótica Prisma');
  });
  afterAll(closeAll);

  it('designer não vê financeiro nem comercial; escopo de clientes é a equipe', async () => {
    expect(rafa.perms.has('financeiro.view')).toBe(false);
    await expect(pipelineBoard(rafa)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const p = await portfolio(rafa);
    const ids = p.clients.map((c) => c.id);
    expect(ids).toContain(terraMar);
    expect(ids).not.toContain(otica);
    expect(p.clients.every((c) => c.mrrCents === null)).toBe(true);
    await expect(getClient(rafa, otica)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const contents = await listContents(rafa);
    expect(contents.length).toBeGreaterThan(0);
    expect(
      contents.every(
        (c) =>
          rafa.teamClientIds.has(c.clientId) ||
          [c.ownerId, c.designerId, c.copywriterId].includes(rafa.memberId),
      ),
    ).toBe(true);
    expect(contents.some((c) => c.clientId === otica)).toBe(false);
  });

  it('escopo own: designer só lista tarefas dele (ou em que participa)', async () => {
    const tasks = await listTasks(rafa, { view: 'all' });
    expect(tasks.length).toBeGreaterThan(0);
    const parts = await adminDb()
      .select()
      .from(s.taskAssignees)
      .where(eq(s.taskAssignees.memberId, rafa.memberId));
    expect(tasks.every((t) => t.assigneeId === rafa.memberId || parts.some((p) => p.taskId === t.id))).toBe(
      true,
    );
    const all = await listTasks(admin, { view: 'all' });
    expect(all.length).toBeGreaterThan(tasks.length);
  });

  it('exceção individual concede e nega por cima dos cargos', async () => {
    await setOverride(admin, rafa.memberId, 'financeiro.view', 'grant', 'all');
    expect((await loadCtx(rafa.userId!, rafa.workspaceId))!.perms.get('financeiro.view')).toBe('all');
    await setOverride(admin, rafa.memberId, 'conteudo.view', 'deny');
    expect((await loadCtx(rafa.userId!, rafa.workspaceId))!.perms.has('conteudo.view')).toBe(false);
    await setOverride(admin, rafa.memberId, 'financeiro.view', null);
    await setOverride(admin, rafa.memberId, 'conteudo.view', null);
    const back = (await loadCtx(rafa.userId!, rafa.workspaceId))!;
    expect(back.perms.has('financeiro.view')).toBe(false);
    expect(back.perms.get('conteudo.view')).toBe('team');
  });

  it('membro desativado perde o acesso (sem contexto)', async () => {
    const duda = await ctxOf('duda@demo.local');
    await setMemberStatus(admin, duda.memberId, 'suspended');
    expect(await loadCtx(duda.userId!, duda.workspaceId)).toBeNull();
    await setMemberStatus(admin, duda.memberId, 'active');
    expect(await loadCtx(duda.userId!, duda.workspaceId)).not.toBeNull();
  });

  it('só quem tem members.manage altera permissões', async () => {
    await expect(setOverride(rafa, rafa.memberId, 'financeiro.view', 'grant')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('workspace B não enxerga dados de A pelos serviços (RLS por baixo do RBAC)', async () => {
    const b = await ctxOf('teste@demo.local', 'workspace-teste');
    expect(b.perms.get('clientes.view')).toBe('all'); // admin em B
    await expect(getClient(b, terraMar)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await portfolio(b)).clients).toHaveLength(0);
    expect(await listTasks(b, { view: 'all' })).toHaveLength(0);
    expect(await listContents(b)).toHaveLength(0);
  });
});
