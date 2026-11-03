'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import * as Popover from '@radix-ui/react-popover';
import { ChevronRight, Menu as MenuIcon, Plus } from 'lucide-react';
import { relative } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { authClient } from '@/lib/auth-client';
import { ICONS, iconOf } from './icons';
import { NAV, CRUMB } from './nav';
import { Avatar, buttonClass, cx } from './ui';
import { Menu, ToastProvider } from './client';
import { QuickCreate, type CreateKind, type Options } from './quick-create';

export interface ShellUser {
  name: string;
  roles: string;
  workspace: string;
  perms: string[];
}

function Notifications() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list.query(),
    refetchInterval: 30_000,
  });
  const unread = q.data?.unread ?? 0;
  return (
    <Popover.Root>
      <Popover.Trigger
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-side"
        aria-label="Notificações"
      >
        <ICONS.bell size={17} />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-bad" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[360px] rounded-xl border border-line bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">
              Notificações {unread > 0 && <span className="text-faint">· {unread} novas</span>}
            </span>
            {unread > 0 && (
              <button
                className="text-[12px] text-muted"
                onClick={() => void api.notifications.markRead.mutate({}).then(() => q.refetch())}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!q.data?.items.length && <div className="px-4 py-8 text-center text-muted">Nada por aqui.</div>}
            {q.data?.items.map((n) => (
              <button
                key={n.id}
                className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-side"
                onClick={() => {
                  void api.notifications.markRead.mutate({ ids: [n.id] }).then(() => q.refetch());
                  if (n.link) router.push(n.link);
                }}
              >
                <span
                  className={cx(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : 'bg-info',
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.title}</span>
                  {n.body && <span className="block truncate text-[12px] text-muted">{n.body}</span>}
                  <span className="text-[11.5px] text-faint">{relative(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CommandK({
  open,
  setOpen,
  nav,
  onCreate,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  nav: { href: string; label: string }[];
  onCreate: (k: CreateKind) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const res = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.search.query({ q }),
    enabled: q.trim().length >= 2,
  });
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Buscar ou executar"
      shouldFilter={false}
      className="fixed top-[14vh] left-1/2 z-[60] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-white shadow-2xl"
    >
      <Command.Input
        value={q}
        onValueChange={setQ}
        placeholder="Buscar clientes, oportunidades, conteúdos, tarefas… ou ir para uma tela"
        className="h-12 w-full border-b border-line px-4 text-[14px] outline-none"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:text-faint">
        <Command.Empty className="px-3 py-6 text-center text-muted">Nada encontrado.</Command.Empty>
        {!!res.data?.length && (
          <Command.Group heading="Resultados">
            {res.data.map((r) => (
              <Command.Item
                key={r.href}
                value={r.href}
                onSelect={() => go(r.href)}
                className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 data-[selected=true]:bg-side"
              >
                {r.label}
                <span className="text-[11.5px] text-faint">{r.kind}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Criar">
          {(['lead', 'task', 'request', 'content', 'meeting'] as const)
            .filter((k) => !q || CREATE_LABEL[k].toLowerCase().includes(q.toLowerCase()))
            .map((k) => (
              <Command.Item
                key={k}
                value={`criar-${k}`}
                onSelect={() => {
                  setOpen(false);
                  onCreate(k);
                }}
                className="cursor-pointer rounded-md px-3 py-2 data-[selected=true]:bg-side"
              >
                Criar {CREATE_LABEL[k].toLowerCase()}
              </Command.Item>
            ))}
        </Command.Group>
        <Command.Group heading="Ir para">
          {nav
            .filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()))
            .map((n) => (
              <Command.Item
                key={n.href}
                value={n.href}
                onSelect={() => go(n.href)}
                className="cursor-pointer rounded-md px-3 py-2 data-[selected=true]:bg-side"
              >
                {n.label}
              </Command.Item>
            ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

const CREATE_LABEL: Record<CreateKind, string> = {
  lead: 'Lead',
  task: 'Tarefa',
  request: 'Solicitação',
  content: 'Conteúdo',
  meeting: 'Reunião',
};
const CREATE_PERM: Record<CreateKind, string | null> = {
  lead: 'comercial.edit',
  task: 'tasks.edit',
  request: 'requests.edit',
  content: 'conteudo.create',
  meeting: null,
};

function ShellInner({
  user,
  options,
  counts,
  children,
}: {
  user: ShellUser;
  options: Options;
  counts: Record<string, number>;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(false);
  const [create, setCreate] = useState<CreateKind | null>(null);
  const perms = useMemo(() => new Set(user.perms), [user.perms]);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.perm || perms.has(i.perm)),
  })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setK((x) => !x);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => setOpen(false), [path]);
  const parts = path.split('/').filter(Boolean);
  const crumbs = parts.map((p, i) => ({
    label: CRUMB[p] ?? (p.length > 20 ? 'Detalhe' : p),
    href: '/' + parts.slice(0, i + 1).join('/'),
  }));
  const active = flat
    .filter((i) => path === i.href || path.startsWith(i.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const creatable = (Object.keys(CREATE_LABEL) as CreateKind[]).filter(
    (c) => !CREATE_PERM[c] || perms.has(CREATE_PERM[c]!),
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[232px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-side px-2.5 py-3.5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-2 py-1">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-[11.5px] font-bold text-white">
            4P
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-semibold">{user.workspace}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.roles}</span>
          </span>
        </div>
        <button
          onClick={() => setK(true)}
          className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-left text-faint"
        >
          <ICONS.search size={14} />
          <span className="flex-1">Buscar ou executar…</span>
          <kbd className="rounded border border-line px-1 font-mono text-[10.5px]">⌘K</kbd>
        </button>
        <nav className="flex-1 space-y-3">
          {groups.map((g) => (
            <div key={g.label ?? 'main'}>
              {g.label && <div className="px-2.5 pb-1 text-[11.5px] text-faint">{g.label}</div>}
              {g.items.map((i) => {
                const I = iconOf(i.icon);
                const on = active === i.href;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cx(
                      'flex h-8 items-center gap-2.5 rounded-md px-2.5',
                      on
                        ? 'bg-white font-medium text-ink shadow-[0_0_0_1px_#ecebe7]'
                        : 'text-[#3d3d3a] hover:bg-[#f1f0ec]',
                    )}
                  >
                    <I size={15} className={on ? 'text-ink' : 'text-faint'} />
                    <span className="flex-1 truncate">{i.label}</span>
                    {!!counts[i.href] && (
                      <span className="num rounded bg-bad-bg px-1.5 text-[11px] font-semibold text-bad">
                        {counts[i.href]}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {(perms.has('members.manage') || perms.has('settings.manage')) && (
          <Link
            href="/configuracoes"
            className={cx(
              'flex h-8 items-center gap-2.5 rounded-md px-2.5',
              path.startsWith('/configuracoes') ? 'bg-white font-medium' : 'text-[#3d3d3a]',
            )}
          >
            <ICONS.settings size={15} className="text-faint" /> Configurações
          </Link>
        )}
        <Menu
          trigger={
            <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f0ec]">
              <Avatar name={user.name} size={28} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-medium">{user.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{user.roles}</span>
              </span>
            </button>
          }
          items={[
            { label: 'Página técnica (fundação)', onSelect: () => router.push('/sistema') },
            {
              label: 'Sair',
              onSelect: () => void authClient.signOut().then(() => router.push('/login')),
              danger: true,
            },
          ]}
        />
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:px-8">
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <MenuIcon size={18} />
          </button>
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]" aria-label="Breadcrumbs">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight size={13} className="text-faint" />}
                {i === crumbs.length - 1 ? (
                  <span className="truncate font-medium">{c.label}</span>
                ) : (
                  <Link href={c.href} className="text-muted">
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <Notifications />
          {creatable.length > 0 && (
            <Menu
              trigger={
                <button className={buttonClass('primary')}>
                  <Plus size={15} /> Criar
                </button>
              }
              items={creatable.map((c) => ({ label: CREATE_LABEL[c], onSelect: () => setCreate(c) }))}
            />
          )}
        </header>
        <main className="mx-auto max-w-[1360px] px-4 py-8 lg:px-8">{children}</main>
      </div>
      <CommandK open={k} setOpen={setK} nav={flat} onCreate={setCreate} />
      <QuickCreate kind={create} onClose={() => setCreate(null)} options={options} />
    </div>
  );
}

export function Shell(props: {
  user: ShellUser;
  options: Options;
  counts: Record<string, number>;
  children: ReactNode;
}) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ShellInner {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
