import { dbHealth, slaExample } from '@/lib/foundation';

export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) =>
  d
    ? d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Página técnica da fundação (Sprint 0). As telas do produto começam na Sprint 1. */
export default async function Page() {
  const db = await dbHealth();
  const sla = slaExample();
  const row = (k: string, v: string, ok?: boolean) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gap: 16,
        padding: '10px 0',
        borderTop: '1px solid #ecebe7',
      }}
    >
      <span style={{ color: '#6f6e69' }}>{k}</span>
      <span style={{ color: ok === false ? '#b42318' : '#1a1a18' }}>{v}</span>
    </div>
  );
  return (
    <main style={{ maxWidth: 760, margin: '64px auto', padding: '0 24px' }}>
      <p style={{ color: '#6f6e69', fontSize: 13 }}>Agency OS · Sprint 0</p>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '4px 0 24px' }}>Fundação</h1>
      {row('Ambiente', process.env.APP_ENV ?? 'local')}
      {row('Banco', db.ok ? 'conectado' : `erro: ${db.error}`, db.ok)}
      {row('Migrações aplicadas', String(db.migrations))}
      {row('Eventos pendentes no outbox', String(db.pendingEvents))}
      {row(
        'SLA · arte estática ter 11:20',
        `vence ${fmt(sla.dueAt)} · ${sla.status} · restam ${sla.remainingBusinessMinutes} min úteis`,
      )}
      {row('Sentry', process.env.SENTRY_DSN ? 'configurado' : 'sem DSN (desligado)')}
    </main>
  );
}
