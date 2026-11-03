import { NextResponse } from 'next/server';
import { uploadFile } from '@aos/domain';
import { getCtx } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Upload (dev: storage em disco). Em produção: URL assinada PUT direto ao R2 + confirmação. */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData();
  const clientId = (form.get('clientId') as string | null) || null;
  const entityType = form.get('entityType') as string | null;
  const entityId = form.get('entityId') as string | null;
  const out = [];
  try {
    for (const f of form.getAll('files')) {
      if (!(f instanceof File)) continue;
      const file = await uploadFile(ctx, {
        name: f.name,
        bytes: new Uint8Array(await f.arrayBuffer()),
        clientId,
        category: (form.get('category') as string | null) ?? undefined,
        link: entityType && entityId ? { entityType, entityId } : undefined,
      });
      out.push({ id: file.id, name: file.name, mime: file.mime });
    }
    return NextResponse.json({ files: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
