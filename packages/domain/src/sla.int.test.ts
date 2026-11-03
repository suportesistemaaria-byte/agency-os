import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema as s } from '@aos/db';
import { calculateDueAt, type SlaPolicy } from '@aos/sla';
import { createRequest, setRequestStatus, triageRequest } from './requests';
import { blockTask, unblockTask } from './tasks';
import { loadCalendar, slaTick } from './sla-clock';
import { read, type Ctx } from './context';
import { clientIdByName, ctxOf, hasDb, uniq } from './test-helpers';

const db = () => adminDb();
const clock = async (id: string) => (await db().select().from(s.slaClocks).where(eq(s.slaClocks.id, id)))[0]!;
const req = async (id: string) => (await db().select().from(s.requests).where(eq(s.requests.id, id)))[0]!;

describe.skipIf(!hasDb())('SLA persistido (sla_clocks + sla_intervals, prazos só pela @aos/sla)', () => {
  let ctx: Ctx;
  let terraMar = '';
  beforeAll(async () => {
    ctx = await ctxOf('manuella@demo.local');
    terraMar = await clientIdByName('Terra Mar');
  });
  afterAll(closeAll);

  it('solicitação nasce com triagem de 2 horas úteis e o prazo bate com a engine', async () => {
    const r = await createRequest(ctx, {
      clientId: terraMar,
      type: 'arte_estatica',
      title: uniq('Arte SLA'),
    });
    const c = await clock(r.slaClockId!);
    expect(c.policyKey).toBe('triagem');
    expect(c.totalMinutes).toBe(120);
    const cal = await read(ctx, (tx) => loadCalendar(tx));
    const expected = calculateDueAt({
      calendar: cal,
      policy: c.policySnapshot as unknown as SlaPolicy,
      createdAt: c.createdFrom,
      now: c.createdFrom,
    });
    expect(c.dueAt!.toISOString()).toBe(expected.dueAt!.toISOString());
  });

  it('triagem fecha o relógio de triagem, abre o de produção (A1, 1 dia útil) e cria a tarefa no mesmo relógio', async () => {
    const r = await createRequest(ctx, {
      clientId: terraMar,
      type: 'arte_estatica',
      title: uniq('Arte triagem'),
    });
    await triageRequest(ctx, r.id, {});
    const after = await req(r.id);
    expect(after.status).toBe('assigned');
    expect((await clock(r.slaClockId!)).stoppedAt).not.toBeNull();
    const prod = await clock(after.slaClockId!);
    expect(prod.policyKey).toBe('arte_estatica');
    expect(prod.totalMinutes).toBe(480);
    const [task] = await db().select().from(s.tasks).where(eq(s.tasks.requestId, r.id));
    expect(task!.slaClockId).toBe(prod.id);
    expect(task!.dueAt!.toISOString()).toBe(prod.dueAt!.toISOString());
    expect(task!.assigneeId).not.toBeNull(); // responsável padrão (design) da equipe da conta
  });

  it('aguardando cliente pausa (sem vencimento) e a retomada devolve o saldo em minutos úteis', async () => {
    const r = await createRequest(ctx, {
      clientId: terraMar,
      type: 'arte_estatica',
      title: uniq('Arte pausa'),
    });
    await triageRequest(ctx, r.id, {});
    for (const st of ['in_production', 'review', 'client_approval'] as const)
      await setRequestStatus(ctx, r.id, st);
    const id = (await req(r.id)).slaClockId!;
    const paused = await clock(id);
    expect(paused.status).toBe('paused');
    expect(paused.dueAt).toBeNull();
    const open = await db().select().from(s.slaIntervals).where(eq(s.slaIntervals.clockId, id));
    expect(open).toHaveLength(1);
    expect(open[0]!.endedAt).toBeNull();
    await setRequestStatus(ctx, r.id, 'review');
    const resumed = await clock(id);
    expect(resumed.dueAt).not.toBeNull();
    expect(['on_time', 'near_due']).toContain(resumed.status);
    expect(
      (await db().select().from(s.slaIntervals).where(eq(s.slaIntervals.clockId, id)))[0]!.endedAt,
    ).not.toBeNull();
    await setRequestStatus(ctx, r.id, 'delivered');
    expect(['met', 'missed']).toContain((await clock(id)).status);
  });

  it('bloqueio da tarefa pausa como BLOCKED e desbloquear retoma', async () => {
    const r = await createRequest(ctx, { clientId: terraMar, type: 'video', title: uniq('Vídeo bloqueio') });
    await triageRequest(ctx, r.id, {});
    const [task] = await db().select().from(s.tasks).where(eq(s.tasks.requestId, r.id));
    await blockTask(ctx, task!.id, {
      reason: 'Aguardando material bruto',
      resolver: 'Cliente',
      external: true,
    });
    expect((await clock(task!.slaClockId!)).status).toBe('blocked');
    const [blk] = await db().select().from(s.taskBlocks).where(eq(s.taskBlocks.taskId, task!.id));
    expect(blk).toMatchObject({ reason: 'Aguardando material bruto', resolver: 'Cliente', endedAt: null });
    await unblockTask(ctx, task!.id);
    expect((await clock(task!.slaClockId!)).status).not.toBe('blocked');
    const [t2] = await db().select().from(s.tasks).where(eq(s.tasks.id, task!.id));
    expect(t2!.status).toBe('in_progress');
  });

  it('cron emite sla.near_due e sla.overdue uma única vez cada', async () => {
    const r = await createRequest(ctx, {
      clientId: terraMar,
      type: 'alteracao',
      title: uniq('Alteração cron'),
      urgent: true,
    });
    await triageRequest(ctx, r.id, {});
    const id = (await req(r.id)).slaClockId!;
    const c = await clock(id);
    const cal = await read(ctx, (tx) => loadCalendar(tx));
    const now = new Date();
    const backdate = async (target: 'NEAR_DUE' | 'OVERDUE') => {
      let from = new Date(now);
      for (let i = 0; i < 3000; i++) {
        from = new Date(from.getTime() - 10 * 60_000);
        if (
          calculateDueAt({
            calendar: cal,
            policy: c.policySnapshot as unknown as SlaPolicy,
            createdAt: from,
            now,
          }).status === target
        )
          break;
      }
      await db().update(s.slaClocks).set({ createdFrom: from, startAt: from }).where(eq(s.slaClocks.id, id));
    };
    const count = async (type: string) =>
      (
        await db()
          .select()
          .from(s.domainEvents)
          .where(and(eq(s.domainEvents.type, type), eq(s.domainEvents.workspaceId, ctx.workspaceId)))
      ).filter((e) => (e.payload as { clockId: string }).clockId === id).length;
    await backdate('NEAR_DUE');
    await slaTick(now);
    await slaTick(now);
    expect(await count('sla.near_due')).toBe(1);
    expect((await clock(id)).status).toBe('near_due');
    await backdate('OVERDUE');
    await slaTick(now);
    await slaTick(now);
    expect(await count('sla.overdue')).toBe(1);
    expect((await clock(id)).status).toBe('overdue');
  });
});
