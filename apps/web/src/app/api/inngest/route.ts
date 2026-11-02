import { serve } from 'inngest/next';
import { functions, inngest } from '@aos/jobs';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
