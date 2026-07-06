/**
 * Compute the next polling interval using exponential backoff.
 * @param consecutiveUnchanged - number of consecutive polls with no state change
 * @param options.initial - starting interval in ms (default 900)
 * @param options.cap - maximum interval in ms (default 8000)
 * @param options.factor - backoff multiplier (default 1.8)
 * @returns interval in ms
 */
export function computeBackoffInterval(
  consecutiveUnchanged: number,
  options?: { initial?: number; cap?: number; factor?: number }
): number {
  const initial = options?.initial ?? 900;
  const cap = options?.cap ?? 8000;
  const factor = options?.factor ?? 1.8;
  return Math.min(initial * Math.pow(factor, consecutiveUnchanged), cap);
}
