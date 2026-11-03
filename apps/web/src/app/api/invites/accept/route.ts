import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { acceptInvite } from '@aos/domain';
import { auth } from '@/server/auth';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { token } = (await req.json()) as { token: string };
  try {
    return NextResponse.json(await acceptInvite(token, session.user.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
