import { requirePortal } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function PortalResults() {
  await requirePortal();
  return (
    <div className="space-y-2">
      <h1 className="text-[22px] font-semibold">Resultados</h1>
      <p className="text-muted">
        Os resultados das suas redes aparecem aqui assim que a agência registrar as métricas do período.
      </p>
    </div>
  );
}
