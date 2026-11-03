'use client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server/router';

/** Cliente tRPC tipado ponta a ponta (o mesmo contrato servirá o app Expo no futuro). */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
});
