'use client';
import { createContext, useCallback, useContext, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import * as DM from '@radix-ui/react-dropdown-menu';
import { X } from 'lucide-react';
import { cx } from './ui';

type Toast = { id: number; text: string; tone: 'ok' | 'bad'; undo?: () => void };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.undo ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] text-white shadow-lg',
              t.tone === 'bad' ? 'bg-bad' : 'bg-ink',
            )}
          >
            {t.text}
            {t.undo && (
              <button
                className="font-semibold underline"
                onClick={() => {
                  t.undo?.();
                  setItems((x) => x.filter((i) => i.id !== t.id));
                }}
              >
                Desfazer
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Executa uma mutação tRPC com feedback (toast) e recarrega os dados da página. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      ok?: string,
      opts: { undo?: () => Promise<unknown>; refresh?: boolean } = {},
    ): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (ok)
          toast({
            text: ok,
            tone: 'ok',
            undo: opts.undo
              ? () =>
                  void opts.undo!()
                    .then(() => router.refresh())
                    .catch((e: Error) => toast({ text: e.message, tone: 'bad' }))
              : undefined,
          });
        if (opts.refresh !== false) start(() => router.refresh());
        // Sucesso nunca devolve undefined (undefined = falha): mutações sem retorno viram `true`.
        return (r === undefined ? true : r) as T;
      } catch (e) {
        toast({ text: (e as Error).message || 'Algo deu errado.', tone: 'bad' });
        return undefined;
      }
    },
    [router, toast],
  );
  return { run, pending };
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <Dialog.Content
          className={cx(
            'fixed top-[8vh] left-1/2 z-50 max-h-[84vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-xl border border-line bg-white shadow-xl',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="text-muted" aria-label="Fechar">
              <X size={16} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <div className="space-y-4 p-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/10" />
        <Dialog.Content className="fixed top-0 right-0 z-50 h-full w-[min(520px,100vw)] overflow-y-auto border-l border-line bg-white shadow-xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-3.5">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="text-muted" aria-label="Fechar">
              <X size={16} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <div className="space-y-4 p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Menu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: { label: string; onSelect: () => void; danger?: boolean }[];
}) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-lg border border-line bg-white p-1 shadow-lg"
        >
          {items.map((i) => (
            <DM.Item
              key={i.label}
              onSelect={i.onSelect}
              className={cx(
                'cursor-pointer rounded-md px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-side',
                i.danger && 'text-bad',
              )}
            >
              {i.label}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
