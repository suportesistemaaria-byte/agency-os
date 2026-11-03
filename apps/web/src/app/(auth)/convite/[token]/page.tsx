import { findInvite } from '@aos/domain';
import { AcceptInvite } from './accept';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvite(token);
  if (!inv)
    return (
      <div className="space-y-2">
        <h1 className="text-[20px] font-semibold">Convite inválido</h1>
        <p className="text-muted">O link expirou, foi revogado ou já foi usado. Peça um novo convite.</p>
      </div>
    );
  return <AcceptInvite token={token} email={inv.i.email} name={inv.i.name ?? ''} workspace={inv.workspace} />;
}
