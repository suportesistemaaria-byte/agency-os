import { listClientsBasic, listContents } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { Chips, Empty, PageHeader, Tabs } from '@/components/ui';
import { ContentKanban, ContentList, FeedPreview, MonthCalendar } from '@/components/content-views';

export const dynamic = 'force-dynamic';

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; c?: string; m?: string }>;
}) {
  const ctx = await requirePerm('conteudo.view');
  const sp = await searchParams;
  const v = sp.v ?? 'kanban';
  const clients = await listClientsBasic(ctx);
  const clientId = sp.c && clients.some((c) => c.id === sp.c) ? sp.c : undefined;
  const month = sp.m ?? new Date().toISOString().slice(0, 7);
  const items = await listContents(ctx, { clientId });
  const q = (k: string, val: string) => {
    const p = new URLSearchParams({ v, ...(clientId ? { c: clientId } : {}), m: month, [k]: val });
    if (k === 'c' && !val) p.delete('c');
    return `?${p.toString()}`;
  };
  const [y, mo] = month.split('-').map(Number) as [number, number];
  const shift = (n: number) => new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);
  const monthLabel = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <div>
      <PageHeader
        eyebrow="Operação"
        title="Conteúdos"
        subtitle={`${items.length} conteúdos${clientId ? '' : ' · todos os clientes'}`}
        actions={
          <Tabs
            active={v}
            items={[
              { key: 'calendario', label: 'Calendário', href: q('v', 'calendario') },
              { key: 'kanban', label: 'Kanban', href: q('v', 'kanban') },
              { key: 'feed', label: 'Feed', href: q('v', 'feed') },
              { key: 'lista', label: 'Lista', href: q('v', 'lista') },
            ]}
          />
        }
      />
      <div className="mb-5">
        <Chips
          active={clientId ?? 'all'}
          items={[
            { key: 'all', label: 'Todos os clientes', href: q('c', '') },
            ...clients.map((c) => ({ key: c.id, label: c.name, href: q('c', c.id) })),
          ]}
        />
      </div>
      {v === 'kanban' && <ContentKanban items={items} />}
      {v === 'lista' && <ContentList items={items} />}
      {v === 'calendario' && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <a href={q('m', shift(-1))} className="rounded-md border border-line px-2 py-1">
              ←
            </a>
            <span className="font-semibold capitalize">{monthLabel}</span>
            <a href={q('m', shift(1))} className="rounded-md border border-line px-2 py-1">
              →
            </a>
          </div>
          <MonthCalendar month={month} items={items} />
        </>
      )}
      {v === 'feed' &&
        (clientId ? (
          <FeedPreview clientId={clientId} items={items} />
        ) : (
          <Empty title="Escolha um cliente">A prévia do feed é por cliente (cada um tem seu perfil).</Empty>
        ))}
    </div>
  );
}
