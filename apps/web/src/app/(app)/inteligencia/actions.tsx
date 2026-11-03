'use client';
import { useState } from 'react';
import { METRICS } from '@aos/domain/labels';
import { api } from '@/lib/trpc';
import { Menu, Modal, useAction } from '@/components/client';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

export function MetricsEntry({ clientId, period }: { clientId: string; period: string }) {
  const { run, pending } = useAction();
  const [m, setM] = useState<null | 'manual' | 'csv' | 'goal'>(null);
  const [v, setV] = useState({ date: today(), metric: 'reach', value: '' });
  const [csv, setCsv] = useState('');
  const [goal, setGoal] = useState({ metric: 'reach', period, target: '' });
  const close = () => setM(null);
  return (
    <>
      <Menu
        trigger={<Button variant="primary">Registrar métricas</Button>}
        items={[
          { label: 'Lançar manualmente', onSelect: () => setM('manual') },
          { label: 'Importar CSV', onSelect: () => setM('csv') },
          { label: 'Definir meta do mês', onSelect: () => setM('goal') },
        ]}
      />
      <Modal
        open={m === 'manual'}
        onOpenChange={(o) => !o && close()}
        title="Lançar métrica do perfil"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !v.value}
              onClick={() =>
                run(
                  () =>
                    api.performance.record.mutate({
                      clientId,
                      rows: [{ date: v.date, metric: v.metric, value: Number(v.value.replace(',', '.')) }],
                    }),
                  'Métrica registrada.',
                ).then((r) => r && close())
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Data">
            <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label="Métrica">
            <Select value={v.metric} onChange={(e) => setV({ ...v, metric: e.target.value })}>
              {Object.entries(METRICS).map(([k, x]) => (
                <option key={k} value={k}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor">
            <Input
              inputMode="decimal"
              value={v.value}
              onChange={(e) => setV({ ...v, value: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
      <Modal
        wide
        open={m === 'csv'}
        onOpenChange={(o) => !o && close()}
        title="Importar métricas (CSV)"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !csv.trim()}
              onClick={() =>
                run(
                  () => api.performance.importCsv.mutate({ clientId, csv }),
                  'CSV importado (reimportar o mesmo dia corrige, não duplica).',
                ).then((r) => r && (close(), setCsv('')))
              }
            >
              Importar
            </Button>
          </>
        }
      >
        <p className="text-muted">
          Colunas: <code>data; metrica; valor</code> e, opcionalmente, <code>conteudo</code> (título ou id) e{' '}
          <code>plataforma</code>. Datas AAAA-MM-DD ou DD/MM/AAAA. Métricas: {Object.keys(METRICS).join(', ')}
          .
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
        <Textarea
          className="min-h-40 font-mono text-[12px]"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={
            'data;metrica;valor;conteudo\n2026-11-01;reach;12500;\n2026-11-01;likes;320;Reels prato do dia'
          }
        />
      </Modal>
      <Modal
        open={m === 'goal'}
        onOpenChange={(o) => !o && close()}
        title="Meta do mês"
        footer={
          <>
            <Button onClick={close}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !goal.target}
              onClick={() =>
                run(
                  () =>
                    api.performance.setGoal.mutate({
                      clientId,
                      metric: goal.metric,
                      period: goal.period,
                      target: Number(goal.target),
                    }),
                  'Meta salva.',
                ).then((r) => r && close())
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="Métrica">
            <Select value={goal.metric} onChange={(e) => setGoal({ ...goal, metric: e.target.value })}>
              <option value="engagement">Engajamento</option>
              {Object.entries(METRICS).map(([k, x]) => (
                <option key={k} value={k}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mês">
            <Input
              value={goal.period}
              onChange={(e) => setGoal({ ...goal, period: e.target.value })}
              placeholder="AAAA-MM"
            />
          </Field>
          <Field label="Meta">
            <Input
              inputMode="numeric"
              value={goal.target}
              onChange={(e) => setGoal({ ...goal, target: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function LearningForm({ clientId }: { clientId: string | null }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: '', evidence: '', confidence: 'medium' });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Novo aprendizado
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Novo aprendizado"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !v.title.trim()}
              onClick={() =>
                run(
                  () =>
                    api.performance.addLearning.mutate({
                      clientId,
                      title: v.title,
                      evidence: v.evidence || undefined,
                      confidence: v.confidence as 'medium',
                    }),
                  'Aprendizado registrado como hipótese.',
                ).then((r) => r && (setOpen(false), setV({ title: '', evidence: '', confidence: 'medium' })))
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Aprendizado">
          <Input
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            placeholder="Ex.: Reels com bastidores rendem 2× mais salvamentos"
          />
        </Field>
        <Field label="Evidência">
          <Textarea value={v.evidence} onChange={(e) => setV({ ...v, evidence: e.target.value })} />
        </Field>
        <Field label="Confiança">
          <Select value={v.confidence} onChange={(e) => setV({ ...v, confidence: e.target.value })}>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </Select>
        </Field>
      </Modal>
    </>
  );
}

export function LearningStatus({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  return (
    <Menu
      trigger={
        <Button size="sm" variant="ghost">
          Status
        </Button>
      }
      items={(['hypothesis', 'validated', 'discarded'] as const)
        .filter((x) => x !== status)
        .map((x) => ({
          label: { hypothesis: 'Voltar para hipótese', validated: 'Validar', discarded: 'Descartar' }[x],
          onSelect: () =>
            void run(() => api.performance.learningStatus.mutate({ id, status: x }), 'Status atualizado.'),
        }))}
    />
  );
}
