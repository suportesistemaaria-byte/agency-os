'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STAGE_LABEL } from '@aos/domain/labels';
import { dateShort, dateTime, time } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { useAction } from './client';
import { Avatar, ClientTag, Empty, Table, cx } from './ui';
import { StagePill, Thumb } from './domain-ui';

export interface ContentItem {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientColor: string | null;
  platform: string;
  format: string;
  stage: string;
  scheduledAt: Date | null;
  ownerName: string | null;
  thumbFileId: string | null;
  thumbMime: string | null;
  currentVersion: number;
}

function MiniCard({ c, drag }: { c: ContentItem; drag?: boolean }) {
  return (
    <div className={cx('rounded-[9px] border border-line bg-white p-2.5', drag && 'cursor-grab')}>
      <Thumb fileId={c.thumbFileId} mime={c.thumbMime} label={c.format} className="aspect-[16/9]" />
      <Link
        href={`/conteudos/${c.id}`}
        className="mt-2 block font-medium"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {c.title}
      </Link>
      <div className="mt-1 flex items-center justify-between text-[12px]">
        <ClientTag name={c.clientName} color={c.clientColor} />
        <span className="font-mono text-[11px] text-faint">
          {c.scheduledAt ? dateShort(c.scheduledAt) : 'gaveta'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-muted">
        <span>{c.platform}</span>
        <Avatar name={c.ownerName} size={18} />
      </div>
    </div>
  );
}

function DraggableCard({ c }: { c: ContentItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px,${transform.y}px)` } : undefined}
      className={cx(isDragging && 'relative z-10 opacity-80')}
    >
      <MiniCard c={c} drag />
    </div>
  );
}

function StageColumn({ stage, items }: { stage: string; items: ContentItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex w-[210px] shrink-0 flex-col gap-2 rounded-[10px] bg-side p-2',
        isOver && 'ring-2 ring-[#d9d7d0]',
      )}
    >
      <div className="px-1 pt-1 font-semibold">
        {STAGE_LABEL[stage as keyof typeof STAGE_LABEL]}{' '}
        <span className="ml-1 text-[12px] font-normal text-faint">{items.length}</span>
      </div>
      {items.map((c) => (
        <DraggableCard key={c.id} c={c} />
      ))}
    </div>
  );
}

/** Kanban de conteúdos: arrastar entre etapas de produção (envio/aprovação/alteração têm ações próprias). */
export function ContentKanban({ items: initial }: { items: ContentItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  const { run } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const stages = Object.keys(STAGE_LABEL);
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    const c = items.find((x) => x.id === id);
    if (!c || !to || c.stage === to) return;
    const from = c.stage;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, stage: to } : x)));
    void run(
      () => api.content.move.mutate({ id, stage: to as 'idea' }),
      `"${c.title}" → ${STAGE_LABEL[to as keyof typeof STAGE_LABEL]}`,
      {
        undo: () => api.content.move.mutate({ id, stage: from as 'idea' }),
      },
    ).then((r) => {
      if (r === undefined) setItems((xs) => xs.map((x) => (x.id === id ? { ...x, stage: from } : x)));
    });
  }
  return (
    <DndContext id="content-kanban" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        {stages.map((s) => (
          <StageColumn key={s} stage={s} items={items.filter((x) => x.stage === s)} />
        ))}
      </div>
    </DndContext>
  );
}

export function ContentList({ items }: { items: ContentItem[] }) {
  if (!items.length) return <Empty title="Nenhum conteúdo">Crie pelo botão Criar → Conteúdo.</Empty>;
  return (
    <Table head={['Conteúdo', 'Cliente', 'Plataforma', 'Formato', 'Data', 'Etapa', 'Versão', 'Responsável']}>
      {items.map((c) => (
        <tr key={c.id} className="hover:bg-side">
          <td>
            <Link href={`/conteudos/${c.id}`} className="font-medium">
              {c.title}
            </Link>
          </td>
          <td>
            <ClientTag name={c.clientName} color={c.clientColor} />
          </td>
          <td>{c.platform}</td>
          <td>{c.format}</td>
          <td className="text-muted">{c.scheduledAt ? dateTime(c.scheduledAt) : 'Gaveta'}</td>
          <td>
            <StagePill stage={c.stage} />
          </td>
          <td className="font-mono">{c.currentVersion ? `V${c.currentVersion}` : '—'}</td>
          <td>{c.ownerName}</td>
        </tr>
      ))}
    </Table>
  );
}

/** Calendário mensal (janela visível): conteúdos por data de publicação, mais eventos extras opcionais. */
export function MonthCalendar({
  month,
  items,
  extra = [],
}: {
  month: string;
  items: ContentItem[];
  extra?: {
    id: string;
    date: Date;
    label: string;
    href?: string;
    tone: 'info' | 'warn' | 'bad' | 'neutral';
  }[];
}) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDow + days) / 7) * 7 }, (_, i) => i - startDow + 1);
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const today = key(new Date());
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <div className="grid min-w-[840px] grid-cols-7 border-b border-line text-[12px] text-muted">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d} className="px-3 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-[840px] grid-cols-7">
        {cells.map((d, i) => {
          const ds = d >= 1 && d <= days ? `${month}-${String(d).padStart(2, '0')}` : null;
          const its = ds ? items.filter((c) => c.scheduledAt && key(c.scheduledAt) === ds) : [];
          const ex = ds ? extra.filter((e) => key(e.date) === ds) : [];
          return (
            <div
              key={i}
              className={cx(
                'min-h-[112px] border-b border-line p-1.5',
                i % 7 !== 6 && 'border-r',
                !ds && 'bg-side',
              )}
            >
              {ds && (
                <div
                  className={cx(
                    'mb-1 px-1 font-mono text-[11px]',
                    ds === today ? 'font-bold text-ink' : 'text-faint',
                  )}
                >
                  {d}
                </div>
              )}
              <div className="space-y-1">
                {its.map((c) => (
                  <Link
                    key={c.id}
                    href={`/conteudos/${c.id}`}
                    className="flex items-center gap-1.5 truncate rounded-md border border-line bg-white px-1.5 py-1 text-[11.5px]"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: c.clientColor ?? '#a3a19b' }}
                    />
                    <span className="truncate">
                      {time(c.scheduledAt)} {c.title}
                    </span>
                  </Link>
                ))}
                {ex.map((e) => (
                  <Link
                    key={e.id}
                    href={e.href ?? '#'}
                    className={cx(
                      'block truncate rounded-md px-1.5 py-1 text-[11.5px]',
                      e.tone === 'bad'
                        ? 'bg-bad-bg text-bad'
                        : e.tone === 'warn'
                          ? 'bg-warn-bg text-warn'
                          : e.tone === 'info'
                            ? 'bg-info-bg text-info'
                            : 'bg-side text-muted',
                    )}
                  >
                    {e.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeedTile({ c }: { c: ContentItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cx('relative cursor-grab', isDragging && 'z-10 opacity-70')}
    >
      <Thumb
        fileId={c.thumbFileId}
        mime={c.thumbMime}
        label={c.format}
        className="aspect-[4/5] rounded-none"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-[11px] text-white">
        <div className="truncate font-medium">{c.title}</div>
        <div className="font-mono opacity-80">{dateShort(c.scheduledAt)}</div>
      </div>
    </div>
  );
}

/**
 * Prévia do feed de um cliente: grade por data decrescente; reordenar TROCA AS DATAS (V3).
 * Itens sem data ficam na gaveta.
 */
export function FeedPreview({ clientId, items }: { clientId: string; items: ContentItem[] }) {
  const { run } = useAction();
  const scheduled = useMemo(
    () =>
      items.filter((i) => i.scheduledAt).sort((a, b) => b.scheduledAt!.getTime() - a.scheduledAt!.getTime()),
    [items],
  );
  const drawer = items.filter((i) => !i.scheduledAt);
  const [order, setOrder] = useState(scheduled.map((s) => s.id));
  useEffect(() => setOrder(scheduled.map((s) => s.id)), [scheduled]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const prev = order;
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    setOrder(next);
    void run(
      () => api.content.reorderFeed.mutate({ clientId, orderedIds: next }),
      'Feed reordenado: as datas foram trocadas.',
      {
        undo: () => api.content.reorderFeed.mutate({ clientId, orderedIds: prev }),
      },
    ).then((r) => r === undefined && setOrder(prev));
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="rounded-[10px] border border-line p-3">
        <div className="mb-2 text-[12px] text-muted">Prévia do feed · arraste para trocar as datas</div>
        {order.length ? (
          <DndContext id="feed" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-0.5">
                {order.map((id) => byId.get(id) && <FeedTile key={id} c={byId.get(id)!} />)}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="py-8 text-center text-muted">Nada agendado.</div>
        )}
      </div>
      <div>
        <div className="mb-2 font-semibold">
          Gaveta <span className="text-[12px] font-normal text-faint">{drawer.length} sem data</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {drawer.map((c) => (
            <MiniCard key={c.id} c={c} />
          ))}
          {!drawer.length && <span className="text-muted">Gaveta vazia.</span>}
        </div>
      </div>
    </div>
  );
}
