import { listClientsBasic, listFiles } from '@aos/domain';
import { dateShort } from '@aos/domain/format';
import { requirePerm } from '@/server/session';
import { Chips, ClientTag, Empty, PageHeader, Table } from '@/components/ui';
import { UploadFiles } from '../clientes/[id]/client-actions';

export const dynamic = 'force-dynamic';

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; q?: string }>;
}) {
  const ctx = await requirePerm('clientes.view');
  const sp = await searchParams;
  const [clients, rows] = await Promise.all([
    listClientsBasic(ctx),
    listFiles(ctx, { clientId: sp.c, q: sp.q }),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow="Gestão"
        title="Arquivos e assets"
        subtitle="Arquivos dos clientes que você pode ver; a permissão vem do cliente dono do arquivo."
        actions={sp.c && <UploadFiles clientId={sp.c} />}
      />
      <form className="mb-3">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar pelo nome…"
          className="h-9 w-72 rounded-lg border border-line px-3"
        />
        {sp.c && <input type="hidden" name="c" value={sp.c} />}
      </form>
      <div className="mb-4">
        <Chips
          active={sp.c ?? 'all'}
          items={[
            { key: 'all', label: 'Todos', href: '?' },
            ...clients.map((c) => ({ key: c.id, label: c.name, href: `?c=${c.id}` })),
          ]}
        />
      </div>
      {rows.length ? (
        <Table head={['Arquivo', 'Cliente', 'Tipo', 'Tamanho', 'Enviado por', 'Data']}>
          {rows.map(({ f, client, clientColor, uploader }) => (
            <tr key={f.id} className="hover:bg-side">
              <td>
                <a href={`/api/files/${f.id}`} target="_blank" className="font-medium">
                  {f.name}
                </a>
              </td>
              <td>
                <ClientTag name={client} color={clientColor} />
              </td>
              <td className="font-mono text-[12px]">{f.mime}</td>
              <td className="num">{Math.max(1, Math.round(f.size / 1024))} KB</td>
              <td>{uploader ?? '—'}</td>
              <td className="text-muted">{dateShort(f.createdAt)}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="Nenhum arquivo">Escolha um cliente para enviar arquivos.</Empty>
      )}
    </div>
  );
}
