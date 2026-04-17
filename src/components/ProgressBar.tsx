interface Props {
  value: number; // 0.0–1.0
}

export function ProgressBar({ value }: Props) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-2 w-full rounded-full bg-gray-200">
      <div
        className="h-2 rounded-full bg-blue-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
