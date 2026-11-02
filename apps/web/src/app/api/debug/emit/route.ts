import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { adminDb, schema } from '@aos/db';
import { runCommand } from '@aos/core';

export const dynamic = 'force-dynamic';

/**
 * Rota SOMENTE para ambiente local: grava um evento de teste via runCommand para validar
 * o caminho completo (transação → outbox → relay → Inngest → consumidor). Bloqueada fora de local/ci.
 */
export async function POST() {
  if (!['local', 'ci'].includes(process.env.APP_ENV ?? 'local'))
    return new NextResponse(null, { status: 404 });
  const [ws] = await adminDb()
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, 'agencia-4p'));
  if (!ws) return NextResponse.json({ error: 'rode pnpm db:seed' }, { status: 400 });
  const id = await runCommand(
    'debug.emit',
    { workspaceId: ws.id, actorType: 'system' },
    async ({ emit, audit }) => {
      const eventId = await emit({
        type: 'system.healthcheck',
        entityType: 'system',
        payload: { source: 'debug-route' },
      });
      await audit({ action: 'system.healthcheck', entityType: 'system', metadata: { eventId } });
      return eventId;
    },
  );
  return NextResponse.json({ eventId: id });
}
