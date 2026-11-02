import { NextResponse } from 'next/server';
import { dbHealth } from '@/lib/foundation';

export const dynamic = 'force-dynamic';

/** Usado pelo monitor de uptime. Não expõe detalhes internos em produção. */
export async function GET() {
  const db = await dbHealth();
  const body = {
    status: db.ok ? 'ok' : 'degraded',
    db: db.ok,
    outboxPending: db.pendingEvents,
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
