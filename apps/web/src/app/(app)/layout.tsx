import type { ReactNode } from 'react';
import { SYSTEM_ROLES } from '@aos/db';
import { listClientsBasic, listInvoices, listTasks, memberOptions, pipelineBoard } from '@aos/domain';
import { Shell } from '@/components/shell';
import { requireCtx } from '@/server/session';
import { db } from '@/server/db-name';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const has = (p: string) => ctx.perms.has(p);
  const [clients, members, overdue, board, invoices, wsName] = await Promise.all([
    has('clientes.view') ? listClientsBasic(ctx) : [],
    memberOptions(ctx),
    has('tasks.view') ? listTasks(ctx, { view: 'overdue', mine: true }) : [],
    has('comercial.view') ? pipelineBoard(ctx) : null,
    has('financeiro.view') ? listInvoices(ctx, { status: 'overdue' }) : [],
    db.workspaceName(ctx),
  ]);
  const roles = ctx.roleKeys.map((k) => SYSTEM_ROLES[k]?.name ?? k).join(' · ');
  return (
    <Shell
      user={{
        name: ctx.name,
        roles: `${roles} · ${wsName}`,
        workspace: wsName,
        perms: [...ctx.perms.keys()],
      }}
      options={{ clients: clients.map((c) => ({ id: c.id, name: c.name })), members }}
      counts={{
        '/hoje': overdue.length,
        '/comercial/pipeline': board?.totals.overdueFollowups.length ?? 0,
        '/financeiro/receber': invoices.length,
      }}
    >
      {children}
    </Shell>
  );
}
