'use client';
import { Button, Empty } from '@/components/ui';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Empty title="Algo deu errado ao carregar esta tela">
      <span className="block">
        {process.env.NODE_ENV === 'development' ? error.message : 'O erro foi registrado.'}
      </span>
      <Button className="mt-3" onClick={reset}>
        Tentar de novo
      </Button>
    </Empty>
  );
}
