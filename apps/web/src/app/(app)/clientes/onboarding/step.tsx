'use client';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';

export function StepCheck({ id, done }: { id: string; done: boolean }) {
  const { run } = useAction();
  return (
    <input
      type="checkbox"
      aria-label="Concluir etapa"
      checked={done}
      onChange={() =>
        run(
          () => api.clients.completeStep.mutate({ stepId: id, done: !done }),
          done ? 'Etapa reaberta.' : 'Etapa concluída.',
        )
      }
      className="h-4 w-4 accent-[#1a1a18]"
    />
  );
}
