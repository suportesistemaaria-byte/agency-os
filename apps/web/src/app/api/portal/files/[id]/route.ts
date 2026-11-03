import { NextResponse } from 'next/server';
import { DomainError, portalReadFile } from '@aos/domain';
import { getPortalCtx } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Arquivo para o contato do cliente: a RLS do portal decide o que existe para ele. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getPortalCtx();
  if (!p) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { file, bytes } = await portalReadFile(p, (await params).id);
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': file.mime, 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: e instanceof DomainError ? 404 : 500 });
  }
}
