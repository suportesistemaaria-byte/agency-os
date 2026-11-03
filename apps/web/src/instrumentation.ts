export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { serverEnv } = await import('@aos/env');
    const env = serverEnv(); // falha cedo se faltar variável obrigatória
    await import('../sentry.server.config');
    const { setAfterCommitHook } = await import('@aos/core');
    if (env.EVENT_DISPATCH === 'local') {
      // Sem Inngest: o outbox é despachado no próprio processo (adaptador local) + crons por intervalo.
      const { kickDispatcher, slaTick, markOverdueInvoices, monthlyBilling, generateRecurringExpenses } =
        await import('@aos/domain');
      setAfterCommitHook(async () => {
        void kickDispatcher();
      });
      if (process.env.NEXT_PHASE !== 'phase-production-build') {
        const tick = async () => {
          await slaTick().catch(() => undefined);
          await markOverdueInvoices().catch(() => undefined);
          await monthlyBilling().catch(() => undefined);
          await generateRecurringExpenses().catch(() => undefined);
          await kickDispatcher().catch(() => undefined);
        };
        setTimeout(tick, 5_000);
        setInterval(tick, 5 * 60_000).unref();
      }
    } else {
      const { inngest } = await import('@aos/jobs');
      setAfterCommitHook(async () => {
        await inngest.send({ name: 'aos/outbox.flush', data: {} });
      });
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
