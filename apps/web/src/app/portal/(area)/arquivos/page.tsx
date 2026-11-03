import { portalFiles, portalInvoices } from '@aos/domain';
import { dateShort, money } from '@aos/domain/format';
import { INVOICE_STATUS_LABEL } from '@aos/domain/labels';
import { requirePortal } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function PortalFiles() {
  const p = await requirePortal();
  const [files, invoices] = await Promise.all([portalFiles(p), portalInvoices(p)]);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-[22px] font-semibold">Arquivos</h1>
        {files.map((f) => (
          <a
            key={f.id}
            href={`/api/portal/files/${f.id}`}
            target="_blank"
            className="flex justify-between border-b border-line py-2.5 last:border-0"
          >
            <span className="truncate font-medium">{f.name}</span>
            <span className="text-[12px] text-muted">{dateShort(f.createdAt)}</span>
          </a>
        ))}
        {!files.length && <p className="text-muted">Nenhum arquivo compartilhado.</p>}
      </section>
      {p.flags.receivesFinance && (
        <section>
          <h2 className="mb-2 font-semibold">Cobranças</h2>
          {invoices.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
            >
              <span>
                <span className="block font-medium">{i.description}</span>
                <span className="text-[12px] text-muted">vence {dateShort(i.dueOn)}</span>
              </span>
              <span className="text-right">
                <span className="num block font-medium">{money(i.amountCents)}</span>
                <span className="text-[11.5px] text-muted">{INVOICE_STATUS_LABEL[i.status]}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
