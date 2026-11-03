import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { adminDb, schema as s, type Tx } from '@aos/db';
import type { CommandKit } from '@aos/core';
import {
  calculateDueAt,
  type BusinessCalendar,
  type SlaPolicy,
  type SlaResult,
  type Weekday,
} from '@aos/sla';
import { command, systemCtx, tenant, type Ctx } from './context';
import { badRequest, must } from './errors';
import { withTenant, appDb } from '@aos/db';
import { SLA_LABEL } from './labels';
export { SLA_LABEL };

export type ClockStatus = (typeof s.slaStatus.enumValues)[number];

/** Calendário do workspace (expediente padrão + feriados) no formato da @aos/sla. */
export async function loadCalendar(tx: Tx): Promise<BusinessCalendar> {
  const [cal] = await tx
    .select()
    .from(s.businessCalendars)
    .where(eq(s.businessCalendars.isDefault, true))
    .limit(1);
  const hol = await tx.select({ date: s.holidays.date }).from(s.holidays);
  const c = must(cal, 'Calendário de expediente não configurado.');
  const periods: BusinessCalendar['periods'] = {};
  for (const [k, v] of Object.entries(c.periods)) periods[Number(k) as Weekday] = v;
  return { timezone: c.timezone, periods, holidays: hol.map((h) => h.date) };
}

export async function loadPolicy(tx: Tx, key: string): Promise<SlaPolicy & { key: string; name: string }> {
  const [p] = await tx.select().from(s.slaPolicies).where(eq(s.slaPolicies.key, key));
  const pol = must(p, `Política de SLA "${key}" não encontrada.`);
  return {
    key: pol.key,
    name: pol.name,
    model: pol.model,
    amount: pol.amount,
    rule: pol.rule === 'A1_same_time' ? 'A1_same_time' : undefined,
    nearDueRatio: Number(pol.nearDueRatio),
    nearDueMinMinutes: pol.nearDueMinMinutes,
  };
}

const toStatus = (r: SlaResult): ClockStatus => r.status.toLowerCase() as ClockStatus;

/** Prazo calculado sem persistir (ex.: próxima ação em 2 horas úteis, follow-up D+2). */
export async function dueFromPolicy(tx: Tx, policy: SlaPolicy, from: Date): Promise<Date> {
  const cal = await loadCalendar(tx);
  return calculateDueAt({ calendar: cal, policy, createdAt: from, now: from }).dueAt!;
}

type Clock = typeof s.slaClocks.$inferSelect;

type Interval = typeof s.slaIntervals.$inferSelect;

async function evaluate(tx: Tx, clock: Clock, now: Date): Promise<SlaResult> {
  const cal = await loadCalendar(tx);
  const intervals = await tx.select().from(s.slaIntervals).where(eq(s.slaIntervals.clockId, clock.id));
  return evaluateWith(cal, clock, intervals, now);
}

function evaluateWith(cal: BusinessCalendar, clock: Clock, intervals: Interval[], now: Date): SlaResult {
  return calculateDueAt({
    calendar: cal,
    policy: clock.policySnapshot as unknown as SlaPolicy,
    createdAt: clock.createdFrom,
    now,
    pausedIntervals: intervals.map((i) => ({
      start: i.startedAt,
      end: i.endedAt ?? undefined,
      kind: i.kind,
    })),
  });
}

/** Grava o resultado no relógio e espelha o vencimento nas tarefas ligadas a ele. */
async function persist(tx: Tx, clock: Clock, r: SlaResult): Promise<Clock> {
  const [c] = await tx
    .update(s.slaClocks)
    .set({
      dueAt: r.dueAt,
      status: clock.stoppedAt ? clock.status : toStatus(r),
      consumedMinutes: Math.round(r.consumedBusinessMinutes),
      updatedAt: new Date(),
    })
    .where(eq(s.slaClocks.id, clock.id))
    .returning();
  if (r.dueAt) await tx.update(s.tasks).set({ dueAt: r.dueAt }).where(eq(s.tasks.slaClockId, clock.id));
  return c!;
}

export async function startClock(
  kit: CommandKit,
  entity: { type: string; id: string },
  policyKey: string,
  createdAt = new Date(),
): Promise<Clock> {
  const { tx } = kit;
  const policy = await loadPolicy(tx, policyKey);
  const cal = await loadCalendar(tx);
  const r = calculateDueAt({ calendar: cal, policy, createdAt, now: createdAt });
  const [clock] = await tx
    .insert(s.slaClocks)
    .values({
      workspaceId: kit.ctx.workspaceId,
      entityType: entity.type,
      entityId: entity.id,
      policyKey,
      policySnapshot: { ...policy } as Record<string, unknown>,
      createdFrom: createdAt,
      startAt: r.startAt,
      dueAt: r.dueAt,
      status: toStatus(r),
      totalMinutes: Math.round(r.totalBusinessMinutes),
    })
    .returning();
  await kit.emit({
    type: 'sla.started',
    entityType: 'sla_clock',
    entityId: clock!.id,
    payload: {
      clockId: clock!.id,
      entityType: entity.type,
      entityId: entity.id,
      dueAt: r.dueAt?.toISOString() ?? null,
    },
  });
  return clock!;
}

async function getClock(tx: Tx, id: string): Promise<Clock> {
  const [c] = await tx.select().from(s.slaClocks).where(eq(s.slaClocks.id, id));
  return must(c, 'Relógio de SLA não encontrado.');
}

/** Pausa (aguardando cliente) ou bloqueio: o relógio para até a retomada. */
export async function pauseClock(
  kit: CommandKit,
  clockId: string,
  kind: 'client' | 'blocked',
  reason: string,
  at = new Date(),
): Promise<Clock> {
  const { tx } = kit;
  const clock = await getClock(tx, clockId);
  if (clock.stoppedAt) return clock;
  const open = await tx
    .select()
    .from(s.slaIntervals)
    .where(and(eq(s.slaIntervals.clockId, clockId), isNull(s.slaIntervals.endedAt)));
  if (open.length) return clock;
  await tx.insert(s.slaIntervals).values({
    workspaceId: kit.ctx.workspaceId,
    clockId,
    kind,
    reason,
    startedAt: at,
  });
  const c = await persist(tx, clock, await evaluate(tx, clock, at));
  await kit.emit({
    type: 'sla.paused',
    entityType: 'sla_clock',
    entityId: clockId,
    payload: { clockId, kind },
  });
  return c;
}

export async function resumeClock(kit: CommandKit, clockId: string, at = new Date()): Promise<Clock> {
  const { tx } = kit;
  const clock = await getClock(tx, clockId);
  const closed = await tx
    .update(s.slaIntervals)
    .set({ endedAt: at })
    .where(and(eq(s.slaIntervals.clockId, clockId), isNull(s.slaIntervals.endedAt)))
    .returning();
  if (!closed.length) return clock;
  const c = await persist(tx, clock, await evaluate(tx, clock, at));
  await kit.emit({
    type: 'sla.resumed',
    entityType: 'sla_clock',
    entityId: clockId,
    payload: { clockId, dueAt: c.dueAt?.toISOString() ?? null },
  });
  return c;
}

/** Encerra o relógio: cumprido (met) se dentro do prazo, senão perdido (missed). */
export async function stopClock(kit: CommandKit, clockId: string, at = new Date()): Promise<Clock> {
  const { tx } = kit;
  const clock = await getClock(tx, clockId);
  if (clock.stoppedAt) return clock;
  await tx
    .update(s.slaIntervals)
    .set({ endedAt: at })
    .where(and(eq(s.slaIntervals.clockId, clockId), isNull(s.slaIntervals.endedAt)));
  const r = await evaluate(tx, clock, at);
  const onTime = r.status !== 'OVERDUE';
  const [c] = await tx
    .update(s.slaClocks)
    .set({
      stoppedAt: at,
      status: onTime ? 'met' : 'missed',
      dueAt: r.dueAt ?? clock.dueAt,
      consumedMinutes: Math.round(r.consumedBusinessMinutes),
      updatedAt: at,
    })
    .where(eq(s.slaClocks.id, clockId))
    .returning();
  await kit.emit({
    type: 'sla.met',
    entityType: 'sla_clock',
    entityId: clockId,
    payload: { clockId, onTime },
  });
  return c!;
}

/** Mudança manual de prazo: só com sla.override, motivo obrigatório e auditoria. */
export async function overrideClock(ctx: Ctx, clockId: string, dueAt: Date, reason: string): Promise<void> {
  if (!ctx.perms.has('sla.override')) throw badRequest('Sem permissão sla.override.');
  if (reason.trim().length < 5) throw badRequest('Informe o motivo da alteração do prazo.');
  await command('sla.override', ctx, async (kit) => {
    const clock = await getClock(kit.tx, clockId);
    await kit.tx.insert(s.slaOverrides).values({
      workspaceId: ctx.workspaceId,
      clockId,
      beforeDue: clock.dueAt,
      afterDue: dueAt,
      reason,
      actorId: ctx.memberId,
    });
    await kit.tx.update(s.slaClocks).set({ dueAt, updatedAt: new Date() }).where(eq(s.slaClocks.id, clockId));
    await kit.tx.update(s.tasks).set({ dueAt }).where(eq(s.tasks.slaClockId, clockId));
    await kit.audit({
      action: 'sla.overridden',
      entityType: 'sla_clock',
      entityId: clockId,
      before: { dueAt: clock.dueAt?.toISOString() ?? null },
      after: { dueAt: dueAt.toISOString() },
      metadata: { reason },
    });
    await kit.emit({
      type: 'sla.overridden',
      entityType: 'sla_clock',
      entityId: clockId,
      payload: { clockId, reason },
    });
  });
}

/**
 * Cron de 5 minutos (V3, seção 8): recalcula os relógios ativos e emite sla.near_due e sla.overdue
 * UMA única vez cada (marcadores near_due_notified_at / overdue_notified_at).
 */
export async function slaTick(
  now = new Date(),
): Promise<{ checked: number; nearDue: number; overdue: number }> {
  const workspaces = await adminDb().select({ id: s.workspaces.id }).from(s.workspaces);
  let checked = 0;
  let nearDue = 0;
  let overdue = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id, 'system');
    const active = await withTenant(appDb(), tenant(ctx), (tx) =>
      tx
        .select()
        .from(s.slaClocks)
        .where(
          and(isNull(s.slaClocks.stoppedAt), inArray(s.slaClocks.status, ['on_time', 'near_due', 'overdue'])),
        )
        .orderBy(desc(s.slaClocks.dueAt)),
    );
    for (const clock of active) {
      checked++;
      await command('sla.tick', ctx, async (kit) => {
        const r = await evaluate(kit.tx, clock, now);
        await persist(kit.tx, clock, r);
        if (r.status === 'NEAR_DUE' && !clock.nearDueNotifiedAt) {
          nearDue++;
          await kit.tx
            .update(s.slaClocks)
            .set({ nearDueNotifiedAt: now })
            .where(eq(s.slaClocks.id, clock.id));
          await kit.emit({
            type: 'sla.near_due',
            entityType: clock.entityType,
            entityId: clock.entityId,
            payload: { clockId: clock.id, entityType: clock.entityType, entityId: clock.entityId },
            idempotencyKey: `sla.near_due:${clock.id}`,
          });
        }
        if (r.status === 'OVERDUE' && !clock.overdueNotifiedAt) {
          overdue++;
          await kit.tx
            .update(s.slaClocks)
            .set({ overdueNotifiedAt: now })
            .where(eq(s.slaClocks.id, clock.id));
          await kit.emit({
            type: 'sla.overdue',
            entityType: clock.entityType,
            entityId: clock.entityId,
            payload: { clockId: clock.id, entityType: clock.entityType, entityId: clock.entityId },
            idempotencyKey: `sla.overdue:${clock.id}`,
          });
        }
      });
    }
  }
  return { checked, nearDue, overdue };
}

export interface LiveSla {
  clockId: string;
  status: ClockStatus;
  dueAt: Date | null;
  remaining: number;
  policyKey: string;
}

/** Status atual para exibição, recalculado no instante da leitura (sem gravar). Uma consulta para N relógios. */
export async function liveStatuses(
  tx: Tx,
  clockIds: (string | null)[],
  now = new Date(),
): Promise<Map<string, LiveSla>> {
  const ids = [...new Set(clockIds.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, LiveSla>();
  if (!ids.length) return out;
  const cal = await loadCalendar(tx);
  const clocks = await tx.select().from(s.slaClocks).where(inArray(s.slaClocks.id, ids));
  const ints = await tx.select().from(s.slaIntervals).where(inArray(s.slaIntervals.clockId, ids));
  for (const c of clocks) {
    if (c.stoppedAt) {
      out.set(c.id, {
        clockId: c.id,
        status: c.status,
        dueAt: c.dueAt,
        remaining: 0,
        policyKey: c.policyKey,
      });
      continue;
    }
    const r = evaluateWith(
      cal,
      c,
      ints.filter((i) => i.clockId === c.id),
      now,
    );
    out.set(c.id, {
      clockId: c.id,
      status: toStatus(r),
      dueAt: r.dueAt,
      remaining: r.remainingBusinessMinutes,
      policyKey: c.policyKey,
    });
  }
  return out;
}
