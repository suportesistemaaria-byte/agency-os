import Link from 'next/link';
import { listCampaigns, listClientsBasic } from '@aos/domain';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { ClientTag, Empty, PageHeader, Table } from '@/components/ui';
import { NewCampaign } from './actions';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const ctx = await requirePerm('conteudo.view');
  const [rows, clients] = await Promise.all([listCampaigns(ctx), listClientsBasic(ctx)]);
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Campanhas"
        subtitle="Agrupam conteúdos de um cliente por objetivo e período."
        actions={
          ctx.perms.has('conteudo.create') && (
            <NewCampaign clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
          )
        }
      />
      {rows.length ? (
        <Table head={['Campanha', 'Cliente', 'Objetivo', 'Período', 'Conteúdos']}>
          {rows.map((r) => (
            <tr key={r.c.id} className="hover:bg-side">
              <td>
                <Link href={`/campanhas/${r.c.id}`} className="font-medium">
                  {r.c.name}
                </Link>
              </td>
              <td>
                <ClientTag name={r.client} />
              </td>
              <td>{r.c.objective ?? '—'}</td>
              <td className="text-muted">
                {r.c.startsOn ? `${dateShort(r.c.startsOn)} – ${dateShort(r.c.endsOn)}` : '—'}
              </td>
              <td className="num">{r.n}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhuma campanha">Crie a primeira para agrupar conteúdos (ex.: Black Friday).</Empty>
      )}
    </div>
  );
}
