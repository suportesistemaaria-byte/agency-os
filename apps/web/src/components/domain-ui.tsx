import { SLA_LABEL, STAGE_LABEL, TASK_STATUS_LABEL, REQUEST_STATUS_LABEL } from '@aos/domain/labels';
import { dateTime, minutes } from '@aos/domain/format';
import { Pill } from './ui';

type Sla = { status: string; dueAt: Date | null; remaining: number } | null;
const SLA_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'neutral' | 'info'> = {
  on_time: 'ok',
  near_due: 'warn',
  overdue: 'bad',
  paused: 'neutral',
  blocked: 'neutral',
  met: 'ok',
  missed: 'bad',
};

/** No prazo · Próximo · Atrasado · Pausado · Bloqueado (rótulos aprovados). */
export function SlaPill({ sla, showDue = true }: { sla: Sla; showDue?: boolean }) {
  if (!sla) return null;
  const label = SLA_LABEL[sla.status as keyof typeof SLA_LABEL] ?? sla.status;
  const extra =
    sla.status === 'overdue'
      ? ` ${minutes(-sla.remaining)}`
      : sla.status === 'near_due'
        ? ` · resta ${minutes(sla.remaining)}`
        : showDue && sla.dueAt && sla.status === 'on_time'
          ? ` · ${dateTime(sla.dueAt)}`
          : '';
  return <Pill tone={SLA_TONE[sla.status] ?? 'neutral'}>{label + extra}</Pill>;
}

export function DuePill({ dueAt, done }: { dueAt: Date | null; done?: boolean }) {
  if (!dueAt) return <span className="text-faint">sem prazo</span>;
  if (done) return <span className="text-faint">{dateTime(dueAt)}</span>;
  const late = dueAt < new Date();
  return (
    <Pill tone={late ? 'bad' : dueAt.getTime() - Date.now() < 86_400_000 ? 'warn' : 'neutral'}>
      {(late ? 'Venceu ' : '') + dateTime(dueAt)}
    </Pill>
  );
}

const STAGE_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'ok' | 'change' | 'bad'> = {
  idea: 'neutral',
  planning: 'neutral',
  production: 'info',
  copy: 'info',
  design: 'info',
  internal_review: 'warn',
  client_approval: 'warn',
  change_requested: 'change',
  approved: 'ok',
  scheduled: 'ok',
  posted: 'neutral',
};
export function StagePill({ stage }: { stage: string }) {
  return (
    <Pill tone={STAGE_TONE[stage] ?? 'neutral'}>
      {STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}
    </Pill>
  );
}

export function TaskStatusPill({ status }: { status: string }) {
  const tone =
    status === 'done'
      ? 'ok'
      : status === 'blocked'
        ? 'bad'
        : status === 'in_progress'
          ? 'info'
          : status === 'review'
            ? 'warn'
            : 'neutral';
  return <Pill tone={tone}>{TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL] ?? status}</Pill>;
}

export function RequestStatusPill({ status }: { status: string }) {
  const tone =
    status === 'delivered'
      ? 'ok'
      : status === 'client_approval'
        ? 'warn'
        : status === 'triage' || status === 'received'
          ? 'info'
          : 'neutral';
  return (
    <Pill tone={tone}>{REQUEST_STATUS_LABEL[status as keyof typeof REQUEST_STATUS_LABEL] ?? status}</Pill>
  );
}

const TEMP: Record<string, ['Frio' | 'Morno' | 'Quente', 'info' | 'warn' | 'bad']> = {
  cold: ['Frio', 'info'],
  warm: ['Morno', 'warn'],
  hot: ['Quente', 'bad'],
};
export function TempPill({ t }: { t: string }) {
  const [l, tone] = TEMP[t] ?? ['Morno', 'warn'];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span
        className={
          tone === 'bad'
            ? 'h-1.5 w-1.5 rounded-full bg-bad'
            : tone === 'warn'
              ? 'h-1.5 w-1.5 rounded-full bg-warn'
              : 'h-1.5 w-1.5 rounded-full bg-info'
        }
      />
      {l}
    </span>
  );
}

/** Miniatura da arte (arquivo do storage, servido após checagem de permissão). */
export function Thumb({
  fileId,
  mime,
  label,
  className = 'aspect-[4/5]',
}: {
  fileId: string | null;
  mime?: string | null;
  label?: string;
  className?: string;
}) {
  if (fileId && mime?.startsWith('image/'))
    return (
      <img
        src={`/api/files/${fileId}`}
        alt={label ?? ''}
        loading="lazy"
        className={`${className} w-full rounded-md border border-line object-cover`}
      />
    );
  return (
    <div
      className={`${className} grid w-full place-items-center rounded-md border border-line bg-[repeating-linear-gradient(135deg,#f3f2ee,#f3f2ee_8px,#ecebe7_8px,#ecebe7_16px)] font-mono text-[10px] tracking-widest text-faint uppercase`}
    >
      {label}
    </div>
  );
}

export const PROPOSAL_STATUS: Record<string, [string, 'neutral' | 'info' | 'warn' | 'ok' | 'bad']> = {
  draft: ['Rascunho', 'neutral'],
  ready: ['Pronta', 'info'],
  sent: ['Enviada', 'info'],
  viewed: ['Visualizada', 'info'],
  negotiation: ['Negociação', 'warn'],
  accepted: ['Aceita', 'ok'],
  refused: ['Recusada', 'bad'],
  expired: ['Expirada', 'neutral'],
};
