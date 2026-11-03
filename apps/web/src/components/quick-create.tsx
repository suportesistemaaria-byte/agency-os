'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FORMATS, PLATFORMS, PRIORITY_LABEL, REQUEST_TYPE_LABEL } from '@aos/domain/labels';
import { parseMoney } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Modal, useAction } from './client';
import { Button, Field, Input, Select, Textarea } from './ui';

export type CreateKind = 'lead' | 'task' | 'request' | 'content' | 'meeting';
export interface Options {
  clients: { id: string; name: string }[];
  members: { id: string; name: string }[];
}

const TITLES: Record<CreateKind, string> = {
  lead: 'Novo lead',
  task: 'Nova tarefa',
  request: 'Nova solicitação',
  content: 'Novo conteúdo',
  meeting: 'Nova reunião',
};

/** Formulários do botão "Criar" (e do ⌘K). Toda escrita passa pelo servidor (tRPC → serviço → runCommand). */
export function QuickCreate({
  kind,
  onClose,
  options,
  defaults,
}: {
  kind: CreateKind | null;
  onClose: () => void;
  options: Options;
  defaults?: { clientId?: string };
}) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) =>
    setV((x) => ({ ...x, [k]: e.target.value }));
  const val = (k: string, d = '') => v[k] ?? d;
  const close = () => {
    setV({});
    onClose();
  };
  const clientSel = (required = false) => (
    <Field label={required ? 'Cliente' : 'Cliente (opcional)'}>
      <Select
        value={val('clientId', defaults?.clientId ?? '')}
        onChange={set('clientId')}
        required={required}
      >
        <option value="">{required ? 'Selecione…' : 'Sem cliente'}</option>
        {options.clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const memberSel = (k: string, label: string, def = '') => (
    <Field label={label}>
      <Select value={val(k, def)} onChange={set(k)}>
        <option value="">—</option>
        {options.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const clientId = () => val('clientId', defaults?.clientId ?? '') || null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    let res: unknown;
    if (kind === 'lead') {
      res = await run(
        () =>
          api.crm.createLead.mutate({
            companyName: val('company'),
            contactName: val('contact') || undefined,
            email: val('email') || undefined,
            phone: val('phone') || undefined,
            source: val('source') || undefined,
            temperature: (val('temperature', 'warm') as 'warm') || 'warm',
            mrrCents: val('mrr') ? parseMoney(val('mrr')) : undefined,
            need: val('need') || undefined,
          }),
        'Lead criado. Próxima ação: 1º contato em 2 horas úteis.',
        { refresh: false },
      );
      if (res) router.push(`/comercial/oportunidades/${(res as { opportunityId: string }).opportunityId}`);
    }
    if (kind === 'task')
      res = await run(
        () =>
          api.tasks.create.mutate({
            title: val('title'),
            description: val('description') || undefined,
            clientId: clientId(),
            assigneeId: val('assigneeId') || undefined,
            priority: (val('priority', 'normal') as 'normal') || 'normal',
            dueAt: val('dueAt') ? new Date(val('dueAt')) : null,
            slaPolicyKey: val('sla') || undefined,
          }),
        'Tarefa criada.',
      );
    if (kind === 'request')
      res = await run(
        () =>
          api.requests.create.mutate({
            clientId: val('clientId', defaults?.clientId ?? ''),
            type: val('type', 'arte_estatica') as 'arte_estatica',
            title: val('title'),
            description: val('description') || undefined,
            urgent: val('urgent') === '1',
          }),
        'Solicitação recebida. Triagem com SLA de 2 horas úteis.',
      );
    if (kind === 'content') {
      res = await run(
        () =>
          api.content.create.mutate({
            clientId: val('clientId', defaults?.clientId ?? ''),
            title: val('title'),
            platform: val('platform', 'Instagram'),
            format: val('format', 'Post'),
            scheduledAt: val('scheduledAt') ? new Date(val('scheduledAt')) : null,
            designerId: val('designerId') || null,
            copywriterId: val('copywriterId') || null,
          }),
        'Conteúdo criado.',
        { refresh: false },
      );
      if (res) router.push(`/conteudos/${(res as { id: string }).id}`);
    }
    if (kind === 'meeting')
      res = await run(
        () =>
          api.meetings.create.mutate({
            title: val('title'),
            startsAt: new Date(val('startsAt')),
            clientId: clientId(),
            location: val('location') || undefined,
            participantIds: val('participant') ? [val('participant')] : [],
          }),
        'Reunião criada.',
      );
    if (res) close();
  }

  if (!kind) return null;
  return (
    <Modal open={!!kind} onOpenChange={(o) => !o && close()} title={TITLES[kind]}>
      <form onSubmit={submit} className="space-y-4">
        {kind === 'lead' && (
          <>
            <Field label="Empresa">
              <Input
                required
                autoFocus
                value={val('company')}
                onChange={set('company')}
                placeholder="Ex.: Padaria Grão"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contato">
                <Input value={val('contact')} onChange={set('contact')} />
              </Field>
              <Field label="WhatsApp / telefone">
                <Input value={val('phone')} onChange={set('phone')} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={val('email')} onChange={set('email')} />
              </Field>
              <Field label="Origem">
                <Select value={val('source')} onChange={set('source')}>
                  <option value="">—</option>
                  {['Instagram', 'Site', 'Indicação', 'WhatsApp', 'Formulário', 'Evento'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Temperatura">
                <Select value={val('temperature', 'warm')} onChange={set('temperature')}>
                  <option value="cold">Frio</option>
                  <option value="warm">Morno</option>
                  <option value="hot">Quente</option>
                </Select>
              </Field>
              <Field label="MRR potencial (R$)">
                <Input inputMode="decimal" value={val('mrr')} onChange={set('mrr')} placeholder="3.900" />
              </Field>
            </div>
            <Field label="Necessidade">
              <Input value={val('need')} onChange={set('need')} />
            </Field>
          </>
        )}
        {(kind === 'task' || kind === 'request' || kind === 'content' || kind === 'meeting') && (
          <Field label="Título">
            <Input required autoFocus value={val('title')} onChange={set('title')} />
          </Field>
        )}
        {kind === 'task' && (
          <>
            {clientSel()}
            <div className="grid grid-cols-2 gap-3">
              {memberSel('assigneeId', 'Responsável')}
              <Field label="Prioridade">
                <Select value={val('priority', 'normal')} onChange={set('priority')}>
                  {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prazo pelo SLA" hint="Calculado em dias/horas úteis">
                <Select value={val('sla')} onChange={set('sla')}>
                  <option value="">Prazo manual</option>
                  <option value="arte_estatica">Arte estática · 1 dia útil</option>
                  <option value="alteracao">Alteração · 1 dia útil</option>
                  <option value="alteracao_urgente">Alteração urgente · 4h úteis</option>
                  <option value="video">Vídeo · 3 dias úteis</option>
                </Select>
              </Field>
              {!val('sla') && (
                <Field label="Prazo manual">
                  <Input type="datetime-local" value={val('dueAt')} onChange={set('dueAt')} />
                </Field>
              )}
            </div>
            <Field label="Descrição">
              <Textarea value={val('description')} onChange={set('description')} />
            </Field>
          </>
        )}
        {kind === 'request' && (
          <>
            {clientSel(true)}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <Select value={val('type', 'arte_estatica')} onChange={set('type')}>
                  {Object.entries(REQUEST_TYPE_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Urgência">
                <Select value={val('urgent', '0')} onChange={set('urgent')}>
                  <option value="0">Normal</option>
                  <option value="1">Urgente</option>
                </Select>
              </Field>
            </div>
            <Field label="Descrição">
              <Textarea value={val('description')} onChange={set('description')} />
            </Field>
          </>
        )}
        {kind === 'content' && (
          <>
            {clientSel(true)}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plataforma">
                <Select value={val('platform', 'Instagram')} onChange={set('platform')}>
                  {PLATFORMS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Formato">
                <Select value={val('format', 'Post')} onChange={set('format')}>
                  {FORMATS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Publicação" hint="Vazio = gaveta do feed">
                <Input type="datetime-local" value={val('scheduledAt')} onChange={set('scheduledAt')} />
              </Field>
              {memberSel('designerId', 'Designer')}
              {memberSel('copywriterId', 'Copywriter')}
            </div>
          </>
        )}
        {kind === 'meeting' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <Input required type="datetime-local" value={val('startsAt')} onChange={set('startsAt')} />
              </Field>
              <Field label="Local">
                <Input value={val('location')} onChange={set('location')} placeholder="Meet, Sala 2…" />
              </Field>
            </div>
            {clientSel()}
            {memberSel('participant', 'Participante')}
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pending}>
            Criar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
