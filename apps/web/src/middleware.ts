import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = [
  '/api/invites',
  '/login',
  '/recuperar-senha',
  '/redefinir-senha',
  '/convite',
  '/api/auth',
  '/api/health',
  '/api/inngest',
  '/api/cron',
  '/api/debug',
];

/** Proteção de rotas: sem cookie de sessão, vai para o login. A validação completa acontece no servidor. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = req.cookies.getAll().some((c) => c.name.endsWith('aos.session_token'));
  if (!hasSession) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
};
