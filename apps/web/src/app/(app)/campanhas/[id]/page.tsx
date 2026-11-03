import Link from 'next/link';
import { getCampaign, listContents } from '@aos/domain';
import { dateShort, dateTime } from '@aos/domain/format';
import { guard, requirePerm } from '@/server/session';
import { Card, ClientTag, Empty, Meta, PageHeader, Table } from '@/components/ui';
import { StagePill } from '@/components/domain-ui';
import { AssignContents } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePerm('conteudo.view');
  const d = await guard(getCampaign(ctx, (await params).id));
  const all = await listContents(ctx, { clientId: d.client.id });
  return (
    <div>
      <PageHeader
        eyebrow="Campanha"
        title={d.campaign.name}
        subtitle={<ClientTag name={d.client.name} color={d.client.color} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card
          title={`Conteúdos (${d.contents.length})`}
          action={
            ctx.perms.has('conteudo.create') && (
              <AssignContents
                campaignId={d.campaign.id}
                candidates={all.filter((c) => !c.campaignId).map((c) => ({ id: c.id, title: c.title }))}
              />
            )
          }
          pad={false}
        >
          {d.contents.length ? (
            <Table head={['Conteúdo', 'Data', 'Etapa']}>
              {d.contents.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/conteudos/${c.id}`} className="font-medium">
                      {c.title}
                    </Link>
                  </td>
                  <td className="text-muted">{c.scheduledAt ? dateTime(c.scheduledAt) : 'Gaveta'}</td>
                  <td>
                    <StagePill stage={c.stage} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="p-5">
              <Empty title="Nenhum conteúdo nesta campanha" />
            </div>
          )}
        </Card>
        <Card title="Resumo">
          <Meta
            rows={[
              ['Objetivo', d.campaign.objective ?? '—'],
              [
                'Período',
                d.campaign.startsOn
                  ? `${dateShort(d.campaign.startsOn)} – ${dateShort(d.campaign.endsOn)}`
                  : '—',
              ],
              ['Progresso', `${Math.round(d.progress * 100)}% aprovado ou publicado`],
            ]}
          />
          <div className="mt-4 h-1.5 rounded bg-line">
            <div className="h-1.5 rounded bg-ok" style={{ width: `${d.progress * 100}%` }} />
          </div>
        </Card>
      </div>
    </div>
  );
}
