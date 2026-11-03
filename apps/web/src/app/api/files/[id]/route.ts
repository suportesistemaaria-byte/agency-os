import { NextResponse } from 'next/server';
import { DomainError, readFileFor } from '@aos/domain';
import { getCtx } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Leitura de arquivo após checagem de permissão (em produção: redireciona para URL assinada do R2). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { file, bytes } = await readFileFor(ctx, (await params).id);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': file.mime,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  } catch (e) {
    const status = e instanceof DomainError ? (e.code === 'FORBIDDEN' ? 403 : 404) : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
