import { getPreferences } from '@aos/domain';
import { requireCtx } from '@/server/session';
import { PageHeader, Table } from '@/components/ui';
import { PrefSwitch } from './switch';

export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const ctx = await requireCtx();
  const prefs = await getPreferences(ctx);
  return (
    <div>
      <PageHeader
        title="Preferências de notificação"
        subtitle="Escolha por tipo de aviso. O WhatsApp chega na fase F1.5 (hoje fica registrado como desligado)."
      />
      <Table head={['Aviso', 'No app', 'E-mail', 'WhatsApp']}>
        {prefs.map((p) => (
          <tr key={p.type}>
            <td>{p.label}</td>
            <td>
              <PrefSwitch eventType={p.type} channel="inApp" value={p.inApp} />
            </td>
            <td>
              <PrefSwitch eventType={p.type} channel="email" value={p.email} />
            </td>
            <td>
              <PrefSwitch eventType={p.type} channel="whatsapp" value={p.whatsapp} />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
