export function withCurrentOption(current: string, options: readonly string[]): string[] {
  const trimmed = current.trim();
  if (!trimmed) return [...options];
  return options.includes(trimmed) ? [...options] : [trimmed, ...options];
}
