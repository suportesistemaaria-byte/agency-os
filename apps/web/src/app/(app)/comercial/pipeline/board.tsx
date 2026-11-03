'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CalendarClock, AlertCircle } from 'lucide-react';
import { dateShort, money, relative, time } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Avatar, Pill, cx } from '@/components/ui';
import { TempPill } from '@/components/domain-ui';

interface Card {
  id: string;
  stageId: string;
  title: string;
  type: string;
  temperature: string;
  mrrCents: number;
  setupCents: number;
  ownerName: string | null;
  lastInteractionAt: Date | null;
  nextAction: { title: string; dueAt: Date } | null;
}

function OppCard({ c }: { c: Card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const late = c.nextAction && c.nextAction.dueAt < new Date();
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cx(
        'cursor-grab rounded-[9px] border border-line bg-white p-3 active:cursor-grabbing',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/comercial/oportunidades/${c.id}`}
          className="font-semibold"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {c.title}
        </Link>
        <TempPill t={c.temperature} />
      </div>
      {c.type !== 'new' && (
        <Pill tone="change" className="mt-1">
          {c.type === 'upsell' ? 'Upsell · cliente' : 'Renovação'}
        </Pill>
      )}
      <div className="num mt-1.5 text-[15px] font-semibold">
        {c.type !== 'new' && '+ '}
        {money(c.mrrCents)}/mês{' '}
        {c.setupCents > 0 && (
          <span className="text-[11.5px] font-normal text-faint">setup {money(c.setupCents)}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
        <Avatar name={c.ownerName} size={18} />
        {c.ownerName} · {c.lastInteractionAt ? relative(c.lastInteractionAt) : 'sem interação'}
      </div>
      {c.nextAction ? (
        <div
          className={cx(
            'mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px]',
            late ? 'bg-bad-bg text-bad' : 'bg-side text-muted',
          )}
        >
          <CalendarClock size={13} />
          <span className="flex-1 truncate">{c.nextAction.title}</span>
          <span className="font-mono text-[11px]">
            {late
              ? `venceu ${dateShort(c.nextAction.dueAt)}`
              : `${dateShort(c.nextAction.dueAt)} ${time(c.nextAction.dueAt)}`}
          </span>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-bad-bg px-2 py-1.5 text-[12px] text-bad">
          <AlertCircle size={13} /> Sem próxima ação
        </div>
      )}
    </div>
  );
}

function Column({
  id,
  name,
  probability,
  cards,
}: {
  id: string;
  name: string;
  probability: number;
  cards: Card[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex w-[260px] shrink-0 flex-col gap-2 rounded-[10px] bg-side p-2',
        isOver && 'ring-2 ring-[#d9d7d0]',
      )}
    >
      <div className="px-1.5 pt-1.5 pb-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            {name} <span className="ml-1 text-[12px] font-normal text-faint">{cards.length}</span>
          </span>
          <span className="font-mono text-[11px] text-faint">{probability}%</span>
        </div>
        <div className="num text-[12px] text-muted">
          {money(cards.reduce((a, c) => a + c.mrrCents, 0))}/mês
        </div>
      </div>
      {cards.map((c) => (
        <OppCard key={c.id} c={c} />
      ))}
    </div>
  );
}

/** Kanban com drag-and-drop, atualização otimista e desfazer. */
export function Board({
  stages,
  cards: initial,
}: {
  stages: { id: string; name: string; probability: number }[];
  cards: Card[];
  reasons: { id: string; name: string }[];
}) {
  const [cards, setCards] = useState(initial);
  useEffect(() => setCards(initial), [initial]);
  const { run } = useAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const to = e.over?.id ? String(e.over.id) : null;
    const card = cards.find((c) => c.id === id);
    if (!card || !to || card.stageId === to) return;
    const from = card.stageId;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId: to } : c)));
    void run(
      () => api.crm.move.mutate({ id, stageId: to }),
      `${card.title} movida para ${stages.find((s) => s.id === to)?.name}.`,
      {
        undo: () => api.crm.move.mutate({ id, stageId: from }),
      },
    ).then((r) => {
      if (r === undefined) setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId: from } : c)));
    });
  }
  return (
    <DndContext id="pipeline" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        {stages.map((s) => (
          <Column key={s.id} {...s} cards={cards.filter((c) => c.stageId === s.id)} />
        ))}
      </div>
    </DndContext>
  );
}
