export function HealthBar({ score, title }: { score: number | null; title?: string }) {
  if (score === null)
    return (
      <span className="flex items-center gap-2" title="Em onboarding">
        <span className="font-mono text-faint">—</span>
        <span className="h-1 flex-1 rounded bg-info" />
      </span>
    );
  const color = score >= 75 ? '#2f7d4f' : score >= 50 ? '#b7791f' : '#c0392b';
  return (
    <span className="flex items-center gap-2" title={title}>
      <span className="num w-7 font-mono font-semibold" style={{ color }}>
        {score}
      </span>
      <span className="h-1 flex-1 rounded bg-line">
        <span className="block h-1 rounded" style={{ width: `${score}%`, background: color }} />
      </span>
    </span>
  );
}
