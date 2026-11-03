import type { ReactNode } from 'react';
import { portalContents } from '@aos/domain';
import { requirePortal } from '@/server/session';
import { PortalShell } from '@/components/portal';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const p = await requirePortal();
  const waiting = (await portalContents(p)).filter((c) => c.stage === 'client_approval').length;
  return (
    <PortalShell client={p.clientName} agency={p.agencyName} name={p.name} waiting={waiting}>
      {children}
    </PortalShell>
  );
}
