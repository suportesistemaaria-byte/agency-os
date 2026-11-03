'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/** Erros de renderização do React vão para o Sentry (desligado sem DSN). */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui', padding: 40 }}>
        <h1>Algo deu errado.</h1>
        <p>O erro foi registrado. Recarregue a página.</p>
      </body>
    </html>
  );
}
