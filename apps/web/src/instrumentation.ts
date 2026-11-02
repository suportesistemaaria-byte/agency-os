export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { serverEnv } = await import('@aos/env');
    serverEnv(); // falha cedo se faltar variável obrigatória
    await import('../sentry.server.config');
    const { setAfterCommitHook } = await import('@aos/core');
    const { inngest } = await import('@aos/jobs');
    setAfterCommitHook(async () => {
      await inngest.send({ name: 'aos/outbox.flush', data: {} });
    });
  }
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
