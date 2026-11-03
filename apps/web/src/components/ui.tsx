import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { initials } from '@aos/domain/format';

export const cx = clsx;

type Tone = 'neutral' | 'ok' | 'bad' | 'warn' | 'info' | 'change' | 'dark';
const TONE: Record<Tone, string> = {
  neutral: 'bg-[#f3f2ee] text-muted',
  ok: 'bg-ok-bg text-ok',
  bad: 'bg-bad-bg text-bad',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  change: 'bg-change-bg text-change',
  dark: 'bg-ink text-white',
};
const DOT: Record<Tone, string> = {
  neutral: 'bg-faint',
  ok: 'bg-ok',
  bad: 'bg-bad',
  warn: 'bg-warn',
  info: 'bg-info',
  change: 'bg-change',
  dark: 'bg-white',
};

export function Pill({
  tone = 'neutral',
  dot = true,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  return <span className={cx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />;
}

const BTN = {
  primary: 'bg-ink text-white hover:bg-[#33332f] hover:text-white',
  secondary: 'border border-line bg-white text-ink hover:bg-side',
  ghost: 'text-muted hover:bg-side hover:text-ink',
  danger: 'border border-line bg-white text-bad hover:bg-bad-bg',
};
export function buttonClass(variant: keyof typeof BTN = 'secondary', size: 'sm' | 'md' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]',
    BTN[variant],
  );
}
export function Button({
  variant,
  size,
  className,
  ...p
}: ComponentProps<'button'> & { variant?: keyof typeof BTN; size?: 'sm' | 'md' }) {
  return <button type="button" {...p} className={cx(buttonClass(variant, size), className)} />;
}
export function LinkButton({
  variant,
  size,
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: keyof typeof BTN; size?: 'sm' | 'md' }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />;
}

export const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] outline-none placeholder:text-faint focus:border-[#c9c7c0] focus:ring-2 focus:ring-[#f0efea]';
export function Input(p: ComponentProps<'input'>) {
  return <input {...p} className={cx(inputClass, p.className)} />;
}
export function Textarea(p: ComponentProps<'textarea'>) {
  return <textarea {...p} className={cx(inputClass, 'h-auto min-h-20 py-2', p.className)} />;
}
export function Select(p: ComponentProps<'select'>) {
  return <select {...p} className={cx(inputClass, 'pr-8', p.className)} />;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  action,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={cx('rounded-[10px] border border-line bg-white', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[12px] text-muted">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="mt-1 text-[14px] text-muted">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Faixa de indicadores (sem sombras, separadores finos). */
export function Stats({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }[];
}) {
  return (
    <div
      className="mb-6 grid border-y border-line"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((s, i) => (
        <div key={s.label} className={cx('px-4 py-4 first:pl-0', i > 0 && 'border-l border-line')}>
          <div className="flex items-center gap-1.5 text-[12px] text-muted">
            <Dot tone={s.tone ?? 'neutral'} />
            {s.label}
          </div>
          <div
            className={cx(
              'num mt-1 text-[26px] font-semibold tracking-tight',
              s.tone === 'bad' && 'text-bad',
            )}
          >
            {s.value}
          </div>
          {s.hint && <div className="mt-0.5 text-[11.5px] text-faint">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Tabs({
  items,
  active,
}: {
  items: { key: string; label: ReactNode; href: string; count?: number }[];
  active: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-side p-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cx(
            'rounded-md px-3 py-1 text-[12.5px] font-medium',
            t.key === active ? 'bg-white text-ink shadow-[0_0_0_1px_#ecebe7]' : 'text-muted',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num ml-1.5 text-faint">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Chips({
  items,
  active,
}: {
  items: { key: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className={cx(
            'rounded-md border px-2.5 py-1 text-[12px]',
            c.key === active ? 'border-ink bg-ink text-white hover:text-white' : 'border-line text-muted',
          )}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}

const AV = ['#b4675a', '#5a7f5f', '#7a6aa6', '#3c7f8c', '#b08a3c', '#a24f6d', '#4f6fa2', '#6d6d68'];
export function Avatar({ name, size = 22 }: { name: string | null | undefined; size?: number }) {
  const n = name ?? '?';
  const color = AV[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  return (
    <span
      title={n}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initials(n)}
    </span>
  );
}

export function ClientTag({ name, color }: { name: string | null | undefined; color?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color ?? '#a3a19b' }} />
      {name}
    </span>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[10px] border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-2 text-faint">{icon}</div>}
      <div className="text-[14px] font-medium">{title}</div>
      {children && <div className="mt-1 max-w-md text-[12.5px] text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-[#f1f0ec]', className)} />;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[12px] text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function Meta({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
