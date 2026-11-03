'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Plus, Trash2 } from 'lucide-react';
import { ACTIVITY_LABEL, TEAM_FUNCTIONS } from '@aos/domain/labels';
import { dateTime, money, parseMoney } from '@aos/domain/format';
import { api } from '@/lib/trpc';
import { Menu, Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select, Textarea, cx } from '@/components/ui';

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function OppHeaderActions({
  id,
  state,
  reasons,
}: {
  id: string;
  state: string;
  reasons: { id: string; name: string }[];
}) {
  const { run, pending } = useAction();
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  if (state === 'won') return null;
  if (state !== 'open')
    return (
      <Button
        onClick={() => run(() => api.crm.setState.mutate({ id, state: 'open' }), 'Oportunidade reaberta.')}
        disabled={pending}
      >
        Reabrir
      </Button>
    );
  return (
    <>
      <Button
        onClick={() =>
          run(() => api.crm.setState.mutate({ id, state: 'no_response' }), 'Marcada como sem resposta.')
        }
      >
        Sem resposta
      </Button>
      <Button
        onClick={() => run(() => api.crm.setState.mutate({ id, state: 'paused' }), 'Oportunidade pausada.')}
      >
        Pausar
      </Button>
      <Button onClick={() => setLost(true)}>Perder</Button>
      <Button
        variant="primary"
        onClick={() => run(() => api.crm.markWon.mutate({ id }), 'Venda ganha! Agora transforme em cliente.')}
        disabled={pending}
      >
        Marcar como ganho
      </Button>
      <Modal
        open={lost}
        onOpenChange={setLost}
        title="Marcar como perdida"
        footer={
          <>
            <Button onClick={() => setLost(false)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={!reason}
              onClick={() =>
                run(
                  () => api.crm.setState.mutate({ id, state: 'lost', lostReasonId: reason, note }),
                  'Oportunidade perdida.',
                ).then((r) => r !== undefined && setLost(false))
              }
            >
              Confirmar perda
            </Button>
          </>
        }
      >
        <Field label="Motivo (obrigatório)">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Selecione…</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observação">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

export function NextActionBox({
  action,
  opportunityId,
  canEdit,
}: {
  action: { id: string; title: string; dueAt: Date } | null;
  opportunityId: string;
  canEdit: boolean;
}) {
  const { run } = useAction();
  const [mode, setMode] = useState<null | 'complete' | 'reschedule' | 'add'>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 86_400_000)));
  const late = action && action.dueAt < new Date();
  return (
    <div
      className={cx(
        'flex flex-wrap items-center gap-4 rounded-[10px] border border-l-[3px] bg-white px-5 py-4',
        late ? 'border-bad' : 'border-line border-l-warn',
      )}
    >
      <Flag size={18} className={late ? 'text-bad' : 'text-warn'} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-muted">Próxima ação · obrigatória</div>
        {action ? (
          <>
            <div className="text-[15px] font-semibold">{action.title}</div>
            <div className={cx('text-[12px]', late ? 'text-bad' : 'text-muted')}>
              {(late ? 'Venceu ' : '') + dateTime(action.dueAt)}
            </div>
          </>
        ) : (
          <div className="font-semibold text-bad">Sem próxima ação definida</div>
        )}
      </div>
      {canEdit &&
        (action ? (
          <>
            <Button onClick={() => setMode('reschedule')}>Reagendar</Button>
            <Button variant="primary" onClick={() => setMode('complete')}>
              Concluir e definir a próxima
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setMode('add')}>
            Definir próxima ação
          </Button>
        ))}
      <Modal
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={
          mode === 'reschedule'
            ? 'Reagendar'
            : mode === 'complete'
              ? 'Concluir e definir a próxima'
              : 'Próxima ação'
        }
        footer={
          <>
            <Button onClick={() => setMode(null)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                run(
                  () =>
                    mode === 'reschedule'
                      ? api.crm.rescheduleNextAction.mutate({ id: action!.id, dueAt: new Date(due) })
                      : mode === 'complete'
                        ? api.crm.completeNextAction.mutate({
                            id: action!.id,
                            next: title ? { title, dueAt: new Date(due) } : undefined,
                          })
                        : api.crm.addNextAction.mutate({ opportunityId, title, dueAt: new Date(due) }),
                  'Próxima ação atualizada.',
                ).then((r) => r !== undefined && (setMode(null), setTitle('')))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        {mode !== 'reschedule' && (
          <Field label={mode === 'complete' ? 'Próxima ação (obrigatória enquanto aberta)' : 'O que fazer'}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ligar para negociar o setup"
            />
          </Field>
        )}
        <Field label="Quando">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

export function ActivityBox({ opportunityId }: { opportunityId: string }) {
  const { run, pending } = useAction();
  const [type, setType] = useState<keyof typeof ACTIVITY_LABEL>('whatsapp');
  const [text, setText] = useState('');
  return (
    <div className="space-y-3 border-b border-line p-5">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(ACTIVITY_LABEL) as (keyof typeof ACTIVITY_LABEL)[]).map((k) => (
          <button
            key={k}
            onClick={() => setType(k)}
            className={cx(
              'rounded-md border px-2.5 py-1 text-[12.5px]',
              type === k ? 'border-ink bg-ink text-white' : 'border-line',
            )}
          >
            {ACTIVITY_LABEL[k]}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => api.crm.logActivity.mutate({ opportunityId, type, summary: text }),
            'Atividade registrada.',
          ).then((r) => r !== undefined && setText(''));
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Registrar ${ACTIVITY_LABEL[type].toLowerCase()}: resumo, resultado e próximos passos…`}
        />
        <Button type="submit" variant="primary" disabled={pending || !text.trim()}>
          Registrar
        </Button>
      </form>
    </div>
  );
}

type Item = { description: string; kind: 'setup' | 'recurring'; quantity: number; unitCents: number };

function ItemsEditor({ items, setItems }: { items: Item[]; setItems: (i: Item[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_60px_110px_32px] gap-2">
          <Input
            value={it.description}
            onChange={(e) =>
              setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
            }
            placeholder="Descrição"
          />
          <Select
            value={it.kind}
            onChange={(e) =>
              setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value as Item['kind'] } : x)))
            }
          >
            <option value="recurring">Mensal</option>
            <option value="setup">Setup</option>
          </Select>
          <Input
            type="number"
            min={1}
            value={it.quantity}
            onChange={(e) =>
              setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
            }
          />
          <Input
            defaultValue={it.unitCents ? (it.unitCents / 100).toLocaleString('pt-BR') : ''}
            onBlur={(e) => {
              try {
                const v = parseMoney(e.target.value || '0');
                setItems(items.map((x, j) => (j === i ? { ...x, unitCents: v } : x)));
              } catch {
                /* mantém */
              }
            }}
            placeholder="R$"
          />
          <button
            onClick={() => setItems(items.filter((_, j) => j !== i))}
            className="text-faint"
            aria-label="Remover"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1 text-[12.5px] text-muted"
        onClick={() =>
          setItems([...items, { description: '', kind: 'recurring', quantity: 1, unitCents: 0 }])
        }
      >
        <Plus size={14} /> Item
      </button>
      <div className="flex gap-6 border-t border-line pt-2 text-[12.5px]">
        <span>
          Mensal:{' '}
          <b className="num">
            {money(
              items.filter((i) => i.kind === 'recurring').reduce((a, i) => a + i.quantity * i.unitCents, 0),
            )}
          </b>
        </span>
        <span>
          Setup:{' '}
          <b className="num">
            {money(items.filter((i) => i.kind === 'setup').reduce((a, i) => a + i.quantity * i.unitCents, 0))}
          </b>
        </span>
      </div>
    </div>
  );
}

export function NewProposal({ opportunityId }: { opportunityId: string }) {
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Proposta comercial');
  const [items, setItems] = useState<Item[]>([
    { description: 'Gestão de redes sociais', kind: 'recurring', quantity: 1, unitCents: 0 },
  ]);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={14} /> Nova proposta
      </Button>
      <Modal
        wide
        open={open}
        onOpenChange={setOpen}
        title="Nova proposta"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                run(
                  () => api.crm.createProposal.mutate({ opportunityId, title, items }),
                  'Proposta criada (v1).',
                ).then((r) => r !== undefined && setOpen(false))
              }
            >
              Criar proposta
            </Button>
          </>
        }
      >
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <ItemsEditor items={items} setItems={setItems} />
      </Modal>
    </>
  );
}

export function ProposalActions({
  id,
  status,
  items: current,
}: {
  id: string;
  status: string;
  items: Item[];
}) {
  const { run } = useAction();
  const [ver, setVer] = useState(false);
  const [items, setItems] = useState<Item[]>(current);
  if (status === 'accepted' || status === 'refused') return null;
  return (
    <>
      <Menu
        trigger={<Button size="sm">Ações</Button>}
        items={[
          {
            label: status === 'sent' ? 'Reenviar' : 'Enviar ao cliente',
            onSelect: () =>
              void run(
                () => api.crm.sendProposal.mutate({ id }),
                'Proposta enviada. Follow-ups D+2, D+5 e D+10 criados.',
              ),
          },
          { label: 'Nova versão', onSelect: () => setVer(true) },
          {
            label: 'Registrar aceite',
            onSelect: () =>
              void run(() => api.crm.decideProposal.mutate({ id, decision: 'accepted' }), 'Proposta aceita.'),
          },
          {
            label: 'Registrar recusa',
            onSelect: () =>
              void run(
                () => api.crm.decideProposal.mutate({ id, decision: 'refused' }),
                'Proposta recusada.',
              ),
            danger: true,
          },
        ]}
      />
      <Modal
        wide
        open={ver}
        onOpenChange={setVer}
        title="Nova versão (a anterior fica preservada)"
        footer={
          <>
            <Button onClick={() => setVer(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() =>
                run(
                  () => api.crm.newProposalVersion.mutate({ proposalId: id, items }),
                  'Nova versão criada.',
                ).then((r) => r !== undefined && setVer(false))
              }
            >
              Salvar versão
            </Button>
          </>
        }
      >
        <ItemsEditor items={items} setItems={setItems} />
      </Modal>
    </>
  );
}

/** Conversão Lead → Cliente: uma transação; idempotente pela chave gerada ao abrir o formulário. */
export function ConvertButton({
  opportunityId,
  members,
}: {
  opportunityId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [team, setTeam] = useState<Record<string, string>>({});
  const [legalName, setLegalName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [startOn, setStartOn] = useState(new Date().toISOString().slice(0, 10));
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Transformar em cliente
      </Button>
      <Modal
        wide
        open={open}
        onOpenChange={setOpen}
        title="Transformar em cliente"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !team.atendimento}
              onClick={async () => {
                const r = await run(
                  () =>
                    api.crm.convert.mutate({
                      opportunityId,
                      idempotencyKey: key,
                      missingData: { legalName: legalName || undefined, cnpj: cnpj || undefined },
                      team: Object.entries(team)
                        .filter(([, m]) => m)
                        .map(([f, m]) => ({ function: f, memberId: m })),
                      startOn,
                    }),
                  'Cliente criado: contrato aguardando o Financeiro e onboarding iniciado.',
                  { refresh: false },
                );
                if (r) router.push(`/clientes/${r.clientId}`);
              }}
            >
              Criar cliente
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Empresa e contatos são reaproveitados do lead. Criamos em uma única transação: cliente, contatos,
          contrato (aguardando confirmação do Financeiro), equipe e onboarding de 13 etapas.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Razão social (se faltar)">
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>
          <Field label="CNPJ (se faltar)">
            <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </Field>
          <Field label="Início do contrato">
            <Input type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} />
          </Field>
        </div>
        <div className="text-[13px] font-semibold">Equipe da conta</div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(TEAM_FUNCTIONS).map(([f, label]) => (
            <Field key={f} label={label + (f === 'atendimento' ? ' (obrigatório)' : '')}>
              <Select value={team[f] ?? ''} onChange={(e) => setTeam({ ...team, [f]: e.target.value })}>
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
      </Modal>
    </>
  );
}
