import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireCtx } from '@/server/session';
import { PageHeader } from '@/components/ui';
import { redirect } from 'next/navigation';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  if (!ctx.perms.has('members.manage') && !ctx.perms.has('settings.manage')) redirect('/sem-permissao');
  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="mb-6 flex gap-5 border-b border-line">
        {[
          ['/configuracoes', 'Usuários e convites'],
          ['/configuracoes/cargos', 'Cargos e permissões'],
          ['/configuracoes/sla', 'Expediente, feriados e SLA'],
          ['/configuracoes/automacoes', 'Automações'],
        ].map(([h, l]) => (
          <Link
            key={h}
            href={h!}
            className="-mb-px border-b-2 border-transparent py-2.5 text-muted hover:text-ink"
          >
            {l}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
