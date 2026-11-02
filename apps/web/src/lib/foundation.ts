import 'server-only';
import { sql } from 'drizzle-orm';
import { adminDb } from '@aos/db';
import { calculateDueAt, defaultCalendar, DEFAULT_POLICIES } from '@aos/sla';

export async function dbHealth(): Promise<{ ok: boolean; migrations: number; pendingEvents: number; error?: string }> {
  try {
    const db = adminDb();
    const m = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    const e = await db.execute<{ n: number }>(sql`select count(*)::int as n from domain_events where processed_at is null`);
    return { ok: true, migrations: m.rows[0]?.n ?? 0, pendingEvents: e.rows[0]?.n ?? 0 };
  } catch (err) {
    return { ok: false, migrations: 0, pendingEvents: 0, error: String(err).slice(0, 200) };
  }
}

/** Exemplo aprovado na V3: arte estática ter 11:20 → qua 11:20. */
export function slaExample() {
  return calculateDueAt({
    calendar: defaultCalendar(['2026-11-20']),
    policy: DEFAULT_POLICIES.arte_estatica,
    createdAt: new Date('2026-11-10T11:20:00-03:00'),
    now: new Date('2026-11-10T15:00:00-03:00'),
  });
}
