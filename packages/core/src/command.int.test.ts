import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminDb, appDb, closeAll, schema } from '@aos/db';
import { claimBatch, markProcessed } from '@aos/events';
import { runCommand } from './command';

const hasDb = Boolean(process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL);

describe.skipIf(!hasDb)('runCommand: dado + evento + auditoria na mesma transação', () => {
  let A = '';
  beforeAll(async () => {
    const [w] = await adminDb().select().from(schema.workspaces).where(eq(schema.workspaces.slug, 'agencia-4p'));
    A = w!.id;
  });
  afterAll(closeAll);

  const date = `2031-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;

  it('commit grava os três', async () => {
    const id = await runCommand('holiday.create', { workspaceId: A }, async ({ tx, emit, audit }) => {
      const [h] = await tx.insert(schema.holidays).values({ workspaceId: A, date, name: 'Teste', kind: 'recess' }).returning();
      await emit({ type: 'holiday.created', entityType: 'holiday', entityId: h!.id, payload: { date, name: 'Teste' } });
      await audit({ action: 'holiday.created', entityType: 'holiday', entityId: h!.id, after: h });
      return h!.id;
    });
    const admin = adminDb();
    expect(await admin.select().from(schema.holidays).where(eq(schema.holidays.id, id))).toHaveLength(1);
    expect(await admin.select().from(schema.domainEvents).where(eq(schema.domainEvents.entityId, id))).toHaveLength(1);
    expect(await admin.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, id))).toHaveLength(1);
  });

  it('falha desfaz os três (nenhum evento se perde nem fica órfão)', async () => {
    const d2 = '2032-02-02';
    await expect(
      runCommand('holiday.create', { workspaceId: A }, async ({ tx, emit, audit }) => {
        const [h] = await tx.insert(schema.holidays).values({ workspaceId: A, date: d2, name: 'Falha', kind: 'recess' }).returning();
        await emit({ type: 'holiday.created', entityType: 'holiday', entityId: h!.id, payload: { date: d2, name: 'Falha' } });
        await audit({ action: 'holiday.created', entityType: 'holiday', entityId: h!.id, after: h });
        throw new Error('falha simulada');
      }),
    ).rejects.toThrow('falha simulada');
    const admin = adminDb();
    expect(await admin.select().from(schema.holidays).where(and(eq(schema.holidays.workspaceId, A), eq(schema.holidays.date, d2)))).toHaveLength(0);
  });

  it('relay reserva, entrega e marca como processado', async () => {
    const admin = adminDb();
    const batch = await claimBatch(admin, 500);
    expect(batch.length).toBeGreaterThan(0);
    expect(await claimBatch(admin, 500)).toHaveLength(0); // já reservados: outro relay não pega os mesmos
    await markProcessed(admin, batch.map((e) => e.id));
  });

  it('idempotencyKey evita evento duplicado', async () => {
    const key = 'test-' + Date.now();
    for (let i = 0; i < 2; i++) {
      await runCommand('noop', { workspaceId: A }, ({ emit }) =>
        emit({ type: 'system.healthcheck', entityType: 'system', payload: { source: 'test' }, idempotencyKey: key }),
      );
    }
    const rows = await adminDb().select().from(schema.domainEvents).where(eq(schema.domainEvents.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });
});
