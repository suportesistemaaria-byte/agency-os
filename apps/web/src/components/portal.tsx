'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CheckSquare, Home, Image as ImageIcon, Inbox, MoreHorizontal } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Menu, ToastProvider } from './client';
import { cx } from './ui';

const TABS = [
  { href: '/portal', label: 'Início', icon: Home },
  { href: '/portal/conteudos', label: 'Conteúdos', icon: ImageIcon },
  { href: '/portal/aprovacoes', label: 'Aprovações', icon: CheckSquare },
  { href: '/portal/solicitacoes', label: 'Solicitações', icon: Inbox },
];

/** Portal mobile-first: barra superior com o cliente e navegação inferior fixa. */
export function PortalShell({
  client,
  agency,
  name,
  waiting,
  children,
}: {
  client: string;
  agency: string;
  name: string;
  waiting: number;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const more = [
    { label: 'Reuniões', href: '/portal/reunioes' },
    { label: 'Arquivos', href: '/portal/arquivos' },
    { label: 'Resultados', href: '/portal/resultados' },
  ];
  return (
    <ToastProvider>
      <div className="min-h-screen bg-white pb-20">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur">
          <div className="leading-tight">
            <div className="font-semibold">{client}</div>
            <div className="text-[11.5px] text-muted">Portal · {agency}</div>
          </div>
          <Menu
            trigger={
              <button className="rounded-lg border border-line px-3 py-1.5 text-[12.5px]">
                {name.split(' ')[0]}
              </button>
            }
            items={[
              {
                label: 'Sair',
                danger: true,
                onSelect: () => void authClient.signOut().then(() => router.push('/portal/login')),
              },
            ]}
          />
        </header>
        <main className="mx-auto max-w-[720px] px-4 py-5">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => {
            const on = t.href === '/portal' ? path === '/portal' : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cx(
                  'relative flex flex-col items-center gap-0.5 py-2 text-[11px]',
                  on ? 'font-semibold text-ink' : 'text-muted',
                )}
              >
                <t.icon size={19} />
                {t.label}
                {t.href === '/portal/aprovacoes' && waiting > 0 && (
                  <span className="absolute top-1 right-[28%] rounded-full bg-bad px-1.5 text-[10px] font-bold text-white">
                    {waiting}
                  </span>
                )}
              </Link>
            );
          })}
          <Menu
            trigger={
              <button
                className={cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px]',
                  more.some((m) => path.startsWith(m.href)) ? 'font-semibold text-ink' : 'text-muted',
                )}
              >
                <MoreHorizontal size={19} />
                Mais
              </button>
            }
            items={more.map((m) => ({ label: m.label, onSelect: () => router.push(m.href) }))}
          />
        </nav>
      </div>
    </ToastProvider>
  );
}

export function PortalThumb({
  fileId,
  mime,
  label,
  className = 'aspect-[4/5]',
}: {
  fileId: string | null;
  mime?: string | null;
  label?: string;
  className?: string;
}) {
  if (fileId && mime?.startsWith('image/'))
    return (
      <img
        src={`/api/portal/files/${fileId}`}
        alt={label ?? ''}
        loading="lazy"
        className={`${className} w-full rounded-lg border border-line object-cover`}
      />
    );
  return (
    <div
      className={`${className} grid w-full place-items-center rounded-lg border border-line bg-side font-mono text-[10px] text-faint uppercase`}
    >
      {label}
    </div>
  );
}

export const PORTAL_STAGE: Record<string, [string, string]> = {
  client_approval: ['Aguardando você', 'bg-warn-bg text-warn'],
  change_requested: ['Alteração pedida', 'bg-change-bg text-change'],
  approved: ['Aprovado', 'bg-ok-bg text-ok'],
  scheduled: ['Agendado', 'bg-info-bg text-info'],
  posted: ['Publicado', 'bg-side text-muted'],
};
export function PortalStage({ stage }: { stage: string }) {
  const [l, c] = PORTAL_STAGE[stage] ?? [stage, 'bg-side text-muted'];
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11.5px] font-medium ${c}`}>{l}</span>;
}
