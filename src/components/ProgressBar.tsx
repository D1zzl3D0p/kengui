interface Props {
  value: number; // 0.0–1.0
}

export function ProgressBar({ value }: Props) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className="h-2 w-full rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-2 rounded-full bg-primary transition-all duration-(--motion-medium) ease-(--motion-ease)"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
