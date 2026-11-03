'use client';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, cx } from '@/components/ui';

export function RuleToggle({ id, active }: { id: string; active: boolean }) {
  const { run, pending } = useAction();
  return (
    <button
      role="switch"
      aria-checked={active}
      disabled={pending}
      onClick={() =>
        run(
          () => api.automation.setActive.mutate({ ruleId: id, active: !active }),
          active ? 'Regra desativada.' : 'Regra ativada.',
        )
      }
      className={cx('relative h-5 w-9 rounded-full transition-colors', active ? 'bg-ok' : 'bg-line')}
    >
      <span
        className={cx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
          active ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function RetryButton({ eventId }: { eventId: string }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => run(() => api.automation.retry.mutate({ eventId }), 'Evento reprocessado.')}
    >
      Reprocessar
    </Button>
  );
}
