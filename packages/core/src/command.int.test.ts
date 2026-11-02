import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, closeAll, schema } from '@aos/db';
import { claimBatch, markProcessed } from '@aos/events';
import { runCommand } from './command';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL);

describe.skipIf(!hasDb)('runCommand: dado + evento + auditoria na mesma transação', () => {
  let A = '';
  let U = '';
  beforeAll(async () => {
    const [w] = await adminDb()
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, 'agencia-4p'));
    A = w!.id;
    const [m] = await adminDb()
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, A))
      .limit(1);
    U = m!.userId;
  });
  afterAll(closeAll);

  const date = `2031-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;

  it('commit grava os três', async () => {
    const id = await runCommand('holiday.create', { workspaceId: A }, async ({ tx, emit, audit }) => {
      const [h] = await tx
        .insert(schema.holidays)
        .values({ workspaceId: A, date, name: 'Teste', kind: 'recess' })
        .returning();
      await emit({
        type: 'holiday.created',
        entityType: 'holiday',
        entityId: h!.id,
        payload: { date, name: 'Teste' },
      });
      await audit({ action: 'holiday.created', entityType: 'holiday', entityId: h!.id, after: h });
      return h!.id;
    });
    const admin = adminDb();
    expect(await admin.select().from(schema.holidays).where(eq(schema.holidays.id, id))).toHaveLength(1);
    expect(
      await admin.select().from(schema.domainEvents).where(eq(schema.domainEvents.entityId, id)),
    ).toHaveLength(1);
    expect(await admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, id))).toHaveLength(
      1,
    );
  });

  it('falha desfaz os três (nenhum evento se perde nem fica órfão)', async () => {
    const d2 = '2032-02-02';
    await expect(
      runCommand('holiday.create', { workspaceId: A }, async ({ tx, emit, audit }) => {
        const [h] = await tx
          .insert(schema.holidays)
          .values({ workspaceId: A, date: d2, name: 'Falha', kind: 'recess' })
          .returning();
        await emit({
          type: 'holiday.created',
          entityType: 'holiday',
          entityId: h!.id,
          payload: { date: d2, name: 'Falha' },
        });
        await audit({ action: 'holiday.created', entityType: 'holiday', entityId: h!.id, after: h });
        throw new Error('falha simulada');
      }),
    ).rejects.toThrow('falha simulada');
    const admin = adminDb();
    expect(
      await admin
        .select()
        .from(schema.holidays)
        .where(and(eq(schema.holidays.workspaceId, A), eq(schema.holidays.date, d2))),
    ).toHaveLength(0);
  });

  it('auditoria grava ator, workspace, ação, entidade, before/after coerentes e nenhum segredo', async () => {
    const d3 = `2033-0${1 + Math.floor(Math.random() * 9)}-2${Math.floor(Math.random() * 8)}`;
    const ctx = { workspaceId: A, userId: U, requestId: 'req-audit-test' };
    const id = await runCommand('holiday.create', ctx, async ({ tx, audit }) => {
      const [h] = await tx
        .insert(schema.holidays)
        .values({ workspaceId: A, date: d3, name: 'Original', kind: 'recess' })
        .returning();
      await audit({ action: 'holiday.created', entityType: 'holiday', entityId: h!.id, after: h });
      return h!.id;
    });
    await runCommand('holiday.rename', ctx, async ({ tx, audit }) => {
      const [before] = await tx.select().from(schema.holidays).where(eq(schema.holidays.id, id));
      const [after] = await tx
        .update(schema.holidays)
        .set({ name: 'Renomeado' })
        .where(eq(schema.holidays.id, id))
        .returning();
      await audit({
        action: 'holiday.renamed',
        entityType: 'holiday',
        entityId: id,
        before: { ...before!, apiKey: 'sk_live_vazou' },
        after: { ...after!, apiKey: 'sk_live_vazou2' },
        metadata: { reason: 'teste', password: 'hunter2', authorization: 'Bearer abc' },
      });
    });

    const logs = await adminDb()
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, id))
      .orderBy(schema.auditLogs.createdAt);
    expect(logs).toHaveLength(2);
    const [created, renamed] = logs as [(typeof logs)[number], (typeof logs)[number]];

    for (const l of logs) {
      expect(l.workspaceId).toBe(A);
      expect(l.actorType).toBe('user');
      expect(l.actorId).toBe(U);
      expect(l.entityType).toBe('holiday');
      expect(l.entityId).toBe(id);
      expect(l.metadata).toMatchObject({ requestId: 'req-audit-test' });
    }

    // Criação: before nulo, after com o objeto criado.
    expect(created.action).toBe('holiday.created');
    expect(created.before).toBeNull();
    expect(created.after).toMatchObject({ id, name: 'Original', date: d3 });

    // Alteração: só os campos alterados, valores antigos e novos coerentes.
    expect(renamed.action).toBe('holiday.renamed');
    expect(renamed.before).toMatchObject({ name: 'Original' });
    expect(renamed.after).toMatchObject({ name: 'Renomeado' });
    expect(renamed.before).not.toHaveProperty('date');
    expect(renamed.after).not.toHaveProperty('date');
    expect(renamed.metadata).toMatchObject({ reason: 'teste' });

    // Nenhum segredo armazenado em lugar nenhum da linha.
    const raw = JSON.stringify(logs);
    for (const secret of ['sk_live_vazou', 'hunter2', 'Bearer abc']) expect(raw).not.toContain(secret);
  });

  it('relay reserva, entrega e marca como processado', async () => {
    const admin = adminDb();
    const batch = await claimBatch(admin, 500);
    expect(batch.length).toBeGreaterThan(0);
    expect(await claimBatch(admin, 500)).toHaveLength(0); // já reservados: outro relay não pega os mesmos
    await markProcessed(
      admin,
      batch.map((e) => e.id),
    );
  });

  it('idempotencyKey evita evento duplicado', async () => {
    const key = 'test-' + Date.now();
    for (let i = 0; i < 2; i++) {
      await runCommand('noop', { workspaceId: A }, ({ emit }) =>
        emit({
          type: 'system.healthcheck',
          entityType: 'system',
          payload: { source: 'test' },
          idempotencyKey: key,
        }),
      );
    }
    const rows = await adminDb()
      .select()
      .from(schema.domainEvents)
      .where(eq(schema.domainEvents.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });
});
