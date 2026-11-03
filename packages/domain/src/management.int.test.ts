import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import { createMeeting } from './meetings';
import {
  addMeetingDecision,
  createCampaign,
  executiveDashboard,
  getCampaign,
  getMeeting,
  listFiles,
  setContentCampaign,
  snapshotHealth,
  teamLoad,
} from './management';
import { createContent } from './content';
import type { Ctx } from './context';
import { clientIdByName, ctxOf, hasDb, uniq } from './test-helpers';

const db = () => adminDb();

describe.skipIf(!hasDb())('Bloco 9: gestão', () => {
  let ctx: Ctx;
  let terraMar = '';
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    terraMar = await clientIdByName('Terra Mar');
  });
  afterAll(closeAll);

  it('decisão de reunião vira tarefa do responsável, ligada à reunião', async () => {
    const bia = await ctxOf('bia@demo.local');
    const m = await createMeeting(ctx, {
      title: uniq('Alinhamento'),
      startsAt: new Date(),
      clientId: terraMar,
      participantIds: [bia.memberId],
    });
    const r = await addMeetingDecision(ctx, m.id, {
      description: 'Enviar calendário de dezembro',
      ownerId: bia.memberId,
      slaPolicyKey: 'arte_estatica',
    });
    const [task] = await db().select().from(s.tasks).where(eq(s.tasks.id, r.taskId));
    expect(task).toMatchObject({
      assigneeId: bia.memberId,
      clientId: terraMar,
      originType: 'meeting',
      originId: m.id,
    });
    expect(task!.slaClockId).not.toBeNull();
    const d = await getMeeting(ctx, m.id);
    expect(d.decisions).toHaveLength(1);
    expect(d.decisions[0]!.d.taskId).toBe(r.taskId);
    // quem não participa e não tem visão total não abre a ata
    await expect(getMeeting(await ctxOf('rafa@demo.local'), m.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('campanha agrupa conteúdos só do mesmo cliente', async () => {
    const camp = await createCampaign(ctx, {
      clientId: terraMar,
      name: uniq('Verão'),
      startsOn: '2026-12-01',
      endsOn: '2027-02-28',
    });
    const c = await createContent(ctx, {
      clientId: terraMar,
      title: uniq('Post verão'),
      platform: 'Instagram',
      format: 'Post',
    });
    await setContentCampaign(ctx, c.id, camp.id);
    const other = await createContent(ctx, {
      clientId: await clientIdByName('Café Aurora'),
      title: uniq('Outro cliente'),
      platform: 'Instagram',
      format: 'Post',
    });
    await expect(setContentCampaign(ctx, other.id, camp.id)).rejects.toThrow(/outro cliente/);
    const d = await getCampaign(ctx, camp.id);
    expect(d.contents.map((x) => x.id)).toEqual([c.id]);
    await expect(
      createCampaign(ctx, { clientId: terraMar, name: 'X', startsOn: '2026-12-10', endsOn: '2026-12-01' }),
    ).rejects.toThrow();
  });

  it('carga da equipe bate com as tarefas abertas de cada pessoa', async () => {
    const rows = await teamLoad(ctx);
    const rafa = rows.find((r) => r.name === 'Rafa')!;
    const open = (await db().select().from(s.tasks).where(eq(s.tasks.assigneeId, rafa.id))).filter(
      (t) => !['done', 'cancelled'].includes(t.status),
    );
    expect(rafa.open).toBe(open.length);
    await expect(teamLoad(await ctxOf('rafa@demo.local'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('snapshot diário do health score é único por cliente e dia', async () => {
    const day = '2030-01-15';
    const a = await snapshotHealth(day);
    const b = await snapshotHealth(day);
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(0);
    const rows = await db()
      .select()
      .from(s.clientHealthScores)
      .where(and(eq(s.clientHealthScores.clientId, terraMar), eq(s.clientHealthScores.date, day)));
    expect(rows).toHaveLength(1);
    expect(Array.isArray(rows[0]!.factors)).toBe(true);
  });

  it('painel executivo respeita o perfil: Comercial sem números financeiros', async () => {
    const full = await executiveDashboard(ctx);
    expect(full.finance).not.toBeNull();
    expect(full.clients.total).toBeGreaterThan(0);
    await expect(executiveDashboard(await ctxOf('leo@demo.local'))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const theo = await ctxOf('theo@demo.local'); // tráfego: reports.view sem financeiro
    const partial = await executiveDashboard(theo);
    expect(partial.finance).toBeNull();
    expect(partial.commercial).toBeNull();
  });

  it('arquivos: designer só vê arquivos dos clientes da equipe', async () => {
    const rafa = await ctxOf('rafa@demo.local');
    const files = await listFiles(rafa);
    expect(files.every((f) => !f.f.clientId || rafa.teamClientIds.has(f.f.clientId))).toBe(true);
  });
});
