'use client';
import { useState } from 'react';
import Link from 'next/link';
import { dateTime } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { authClient } from '@/lib/auth-client';
import { Modal, useAction } from '@/components/client';
import { Button, Field, Input } from '@/components/ui';
import { PortalThumb } from '@/components/portal';

/** Aprovar exige sessão recente (decisão 7): se expirou, pede a senha e tenta de novo. */
export function useReauthApprove(email: string) {
  const { run, pending } = useAction();
  const [ask, setAsk] = useState<null | (() => Promise<unknown>)>(null);
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  async function approve(ids: string[], ok: string) {
    const attempt = () => api.portal.approve.mutate({ ids });
    try {
      await attempt();
      return run(async () => undefined, ok);
    } catch (e) {
      if ((e as Error).message.startsWith('REAUTH')) return setAsk(() => attempt);
      return run(() => Promise.reject(e));
    }
  }
  const modal = (
    <Modal
      open={!!ask}
      onOpenChange={(o) => !o && setAsk(null)}
      title="Confirme sua senha para aprovar"
      footer={
        <Button
          variant="primary"
          onClick={async () => {
            const r = await authClient.signIn.email({ email, password: pwd });
            if (r.error) return setErr('Senha incorreta.');
            const fn = ask!;
            setAsk(null);
            setPwd('');
            await run(fn, 'Aprovado. Obrigado!');
          }}
        >
          Confirmar e aprovar
        </Button>
      }
    >
      <p className="text-muted">Por segurança, aprovações pedem uma confirmação recente.</p>
      <Field label="Senha">
        <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
      </Field>
      {err && <p className="text-[12.5px] text-bad">{err}</p>}
    </Modal>
  );
  return { approve, pending, modal };
}

interface Item {
  id: string;
  title: string;
  platform: string;
  format: string;
  scheduledAt: Date | null;
  thumbFileId: string | null;
  thumbMime: string | null;
  caption: string | null;
  version: number;
}

export function BatchApprove({
  items,
  canApprove,
  email,
}: {
  items: Item[];
  canApprove: boolean;
  email: string;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const { approve, pending, modal } = useReauthApprove(email);
  return (
    <div className="space-y-3">
      {canApprove && items.length > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#1a1a18]"
              checked={sel.length === items.length}
              onChange={(e) => setSel(e.target.checked ? items.map((i) => i.id) : [])}
            />
            Selecionar todos
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={!sel.length || pending}
            onClick={() => void approve(sel, `${sel.length} conteúdo(s) aprovados.`).then(() => setSel([]))}
          >
            Aprovar {sel.length || ''}
          </Button>
        </div>
      )}
      {items.map((c) => (
        <div key={c.id} className="flex gap-3 rounded-xl border border-line p-2.5">
          {canApprove && items.length > 1 && (
            <input
              type="checkbox"
              aria-label={`Selecionar ${c.title}`}
              className="mt-1 h-4 w-4 accent-[#1a1a18]"
              checked={sel.includes(c.id)}
              onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))}
            />
          )}
          <Link href={`/portal/aprovacoes/${c.id}`} className="flex min-w-0 flex-1 gap-3">
            <div className="w-20 shrink-0">
              <PortalThumb fileId={c.thumbFileId} mime={c.thumbMime} label={c.format} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">{c.title}</div>
              <div className="text-[12px] text-muted">
                {c.platform} · {c.format} · V{c.version}
              </div>
              <div className="text-[12px] text-muted">
                {c.scheduledAt ? dateTime(c.scheduledAt) : 'sem data'}
              </div>
              {c.caption && <div className="mt-1 line-clamp-2 text-[12px] text-muted">{c.caption}</div>}
            </div>
          </Link>
        </div>
      ))}
      {modal}
    </div>
  );
}
