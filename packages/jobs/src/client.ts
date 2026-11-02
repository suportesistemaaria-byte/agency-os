import { Inngest } from 'inngest';

/** Cliente único do Inngest. Em dev, INNGEST_DEV=1 usa o servidor local (pnpm dev:jobs). */
export const inngest = new Inngest({ id: 'agency-os' });
