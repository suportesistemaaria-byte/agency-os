import { asc, eq } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { assertCan, command, read, type Ctx } from './context';
import { badRequest, must } from './errors';

export async function slaSettings(ctx: Ctx) {
  return read(ctx, async (tx) => ({
    calendar:
      (await tx.select().from(s.businessCalendars).where(eq(s.businessCalendars.isDefault, true)))[0] ?? null,
    holidays: await tx.select().from(s.holidays).orderBy(asc(s.holidays.date)),
    policies: await tx.select().from(s.slaPolicies).orderBy(asc(s.slaPolicies.name)),
  }));
}

export async function addHoliday(
  ctx: Ctx,
  input: { date: string; name: string; kind: 'national' | 'state' | 'municipal' | 'recess' },
) {
  assertCan(ctx, 'settings.manage');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !input.name.trim())
    throw badRequest('Data e nome são obrigatórios.');
  return command('settings.addHoliday', ctx, async (kit) => {
    const [h] = await kit.tx
      .insert(s.holidays)
      .values({ workspaceId: ctx.workspaceId, ...input })
      .onConflictDoNothing()
      .returning();
    if (!h) throw badRequest('Já existe feriado nesta data.');
    await kit.audit({ action: 'holiday.created', entityType: 'holiday', entityId: h.id, after: h });
    await kit.emit({
      type: 'holiday.created',
      entityType: 'holiday',
      entityId: h.id,
      payload: { date: h.date, name: h.name },
    });
  });
}

export async function removeHoliday(ctx: Ctx, id: string) {
  assertCan(ctx, 'settings.manage');
  return command('settings.removeHoliday', ctx, async (kit) => {
    const [h] = await kit.tx.delete(s.holidays).where(eq(s.holidays.id, id)).returning();
    await kit.audit({ action: 'holiday.deleted', entityType: 'holiday', entityId: id, before: must(h) });
  });
}

/** Mudar a política vale para novos relógios; relógios em andamento guardam o snapshot (V3). */
export async function updatePolicy(ctx: Ctx, id: string, amount: number) {
  assertCan(ctx, 'settings.manage');
  if (!Number.isInteger(amount) || amount < 1) throw badRequest('Quantidade inválida.');
  return command('settings.updatePolicy', ctx, async (kit) => {
    const [p] = await kit.tx.select().from(s.slaPolicies).where(eq(s.slaPolicies.id, id));
    const pol = must(p);
    await kit.tx.update(s.slaPolicies).set({ amount, updatedAt: new Date() }).where(eq(s.slaPolicies.id, id));
    await kit.audit({
      action: 'sla.policy_changed',
      entityType: 'sla_policy',
      entityId: id,
      before: { amount: pol.amount },
      after: { amount },
    });
    await kit.emit({
      type: 'sla.policy_changed',
      entityType: 'sla_policy',
      entityId: id,
      payload: { key: pol.key, before: pol.amount, after: amount },
    });
  });
}
