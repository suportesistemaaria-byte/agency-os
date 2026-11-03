import { approvalCenter } from '@aos/domain';
import { requirePerm } from '@/server/session';
import { PageHeader, Stats, Tabs } from '@/components/ui';
import { ApprovalList } from './list';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePerm('conteudo.view');
  const tab = ((await searchParams).tab ?? 'waiting') as 'waiting' | 'changes' | 'approved' | 'late';
  const a = await approvalCenter(ctx);
  return (
    <div>
      <PageHeader
        eyebrow="Operação"
        title="Aprovações"
        subtitle="Prazo de resposta do cliente: 2 dias úteis após o envio (calculado pela engine de SLA)."
        actions={
          <Tabs
            active={tab}
            items={[
              { key: 'waiting', label: 'Aguardando', href: '?tab=waiting', count: a.waiting.length },
              { key: 'changes', label: 'Alteração', href: '?tab=changes', count: a.changes.length },
              { key: 'approved', label: 'Aprovado', href: '?tab=approved', count: a.approved.length },
              { key: 'late', label: 'Atrasado', href: '?tab=late', count: a.late.length },
            ]}
          />
        }
      />
      <Stats
        items={[
          { label: 'Aguardando cliente', value: a.waiting.length, tone: 'warn' },
          { label: 'Alterações', value: a.changes.length, tone: 'change' },
          { label: 'Aprovados', value: a.approved.length, tone: 'ok' },
          { label: 'Resposta atrasada', value: a.late.length, tone: a.late.length ? 'bad' : 'neutral' },
        ]}
      />
      <ApprovalList
        items={a[tab]}
        selectable={tab === 'waiting' || tab === 'late'}
        canApproveOnBehalf={ctx.perms.has('conteudo.approve_on_behalf')}
      />
    </div>
  );
}
