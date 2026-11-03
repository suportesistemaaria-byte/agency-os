'use client';
import { useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { TEAM_FUNCTIONS } from '@aos/domain/labels';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';
import { Button, Field, Input, Select, cx } from '@/components/ui';
import { QuickCreate, type CreateKind } from '@/components/quick-create';

const FLAGS: [keyof Flags, string][] = [
  ['canView', 'Visualizar'],
  ['canComment', 'Comentar'],
  ['canRequest', 'Solicitar'],
  ['canApprove', 'Aprovar'],
  ['receivesFinance', 'Recebe financeiro'],
  ['receivesNotifications', 'Recebe notificações'],
];
type Flags = {
  canView: boolean;
  canComment: boolean;
  canRequest: boolean;
  canApprove: boolean;
  receivesFinance: boolean;
  receivesNotifications: boolean;
};

/** Contatos com as 6 permissões do portal. */
export function ContactsEditor({
  clientId,
  contacts,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
  contacts: {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    isPrimary: boolean;
    flags: Flags;
  }[];
}) {
  const { run } = useAction();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div>
      {contacts.map((c) => (
        <div key={c.id} className="border-b border-line px-5 py-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span>
              <span className="font-medium">{c.name}</span>{' '}
              {c.isPrimary && <span className="text-[11px] text-faint">· principal</span>}
              <span className="block text-[12px] text-muted">
                {[c.role, c.email].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FLAGS.map(([k, l]) => (
              <button
                key={k}
                disabled={!canEdit}
                onClick={() =>
                  run(
                    () => api.clients.contactFlags.mutate({ contactId: c.id, flags: { [k]: !c.flags[k] } }),
                    `${l}: ${c.flags[k] ? 'desligado' : 'ligado'} para ${c.name}.`,
                  )
                }
                className={cx(
                  'rounded-md border px-2 py-0.5 text-[12px]',
                  c.flags[k] ? 'border-ok bg-ok-bg text-ok' : 'border-line text-faint line-through',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
      {canEdit &&
        (adding ? (
          <form
            className="flex gap-2 px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api.clients.addContact.mutate({ clientId, name, email: email || undefined }),
                'Contato adicionado.',
              ).then((r) => r && (setAdding(false), setName(''), setEmail('')));
            }}
          >
            <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              placeholder="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="primary">
              Salvar
            </Button>
          </form>
        ) : (
          <button
            className="flex items-center gap-1 px-5 py-3 text-[12.5px] text-muted"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> Contato
          </button>
        ))}
    </div>
  );
}

export function TeamEditor({
  clientId,
  team,
  members,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
  team: Record<string, string>;
  members: { id: string; name: string }[];
}) {
  const { run } = useAction();
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(TEAM_FUNCTIONS).map(([f, l]) => (
        <Field key={f} label={l}>
          <Select
            disabled={!canEdit}
            value={team[f] ?? ''}
            onChange={(e) =>
              run(
                () => api.clients.setTeam.mutate({ clientId, fn: f, memberId: e.target.value || null }),
                `${l} atualizado.`,
              )
            }
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      ))}
    </div>
  );
}

export function ClientQuickAdd({
  clientId,
  canContent,
  canRequest,
}: {
  clientId: string;
  canContent: boolean;
  canRequest: boolean;
}) {
  const [k, setK] = useState<CreateKind | null>(null);
  return (
    <div className="flex gap-2">
      {canRequest && (
        <Button onClick={() => setK('request')}>
          <Plus size={14} /> Solicitação
        </Button>
      )}
      {canContent && (
        <Button variant="primary" onClick={() => setK('content')}>
          <Plus size={14} /> Conteúdo
        </Button>
      )}
      <QuickCreate
        kind={k}
        onClose={() => setK(null)}
        options={{ clients: [{ id: clientId, name: 'Este cliente' }], members: [] }}
        defaults={{ clientId }}
      />
    </div>
  );
}

export function UploadFiles({
  clientId,
  entity,
}: {
  clientId?: string;
  entity?: { type: string; id: string };
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { run, pending } = useAction();
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf,video/mp4"
        onChange={(e) => {
          const fd = new FormData();
          if (clientId) fd.set('clientId', clientId);
          if (entity) {
            fd.set('entityType', entity.type);
            fd.set('entityId', entity.id);
          }
          for (const f of Array.from(e.target.files ?? [])) fd.append('files', f);
          void run(async () => {
            const r = await fetch('/api/files/upload', { method: 'POST', body: fd });
            const j = (await r.json()) as { error?: string };
            if (!r.ok) throw new Error(j.error ?? 'Falha no upload');
            return j;
          }, 'Arquivo enviado.');
          e.target.value = '';
        }}
      />
      <Button onClick={() => ref.current?.click()} disabled={pending}>
        <Upload size={14} /> Enviar arquivos
      </Button>
    </>
  );
}
