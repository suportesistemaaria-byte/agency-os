'use client';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button } from '@/components/ui';

export function ConfirmContract({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="primary"
      disabled={pending}
      onClick={() =>
        run(
          () => api.finance.confirmContract.mutate({ id }),
          'Contrato confirmado. As cobranças estão sendo geradas.',
        )
      }
    >
      Confirmar contrato
    </Button>
  );
}
