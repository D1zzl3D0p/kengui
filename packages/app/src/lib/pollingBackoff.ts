import type { RuntimeStatus } from '../api/queue';

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

export type HeartbeatHealthBucket = 'fresh' | 'alive-quiet' | 'stale' | 'not-applicable';

export function heartbeatHealthBucket(status?: RuntimeStatus): HeartbeatHealthBucket {
  if (!status || status.watchdog?.state === 'not_applicable' || status.watchdog?.state === 'recovered_failed' || !status.heartbeat) return 'not-applicable';
  if (status.watchdog?.state === 'stale') return 'stale';
  const timeout = status.heartbeat.timeoutSeconds;
  if (!timeout || status.heartbeat.ageSeconds === undefined) return 'not-applicable';
  if (status.heartbeat.ageSeconds > timeout) return 'stale';
  if (status.progress?.ageSeconds !== undefined && status.progress.ageSeconds > timeout) return 'alive-quiet';
  return 'fresh';
}

const terminal = (value: string | null | undefined) =>
  value === 'completed' || value === 'failed' || value === 'cancelled' || value === 'purged';

/** Fingerprint only changes that are meaningful evidence of runtime movement. */
export function runtimeStatusFingerprint(status?: RuntimeStatus): string {
  if (!status) return 'none';
  return JSON.stringify({
    progressUpdatedAt: status.progress?.updatedAt ?? null,
    progressStage: status.progress?.stage ?? null,
    progressPercent: status.progress?.percent ?? null,
    attemptCurrent: status.attempt?.current ?? null,
    attemptMax: status.attempt?.max ?? null,
    nextAttemptAt: status.attempt?.nextAttemptAt ?? null,
    watchdog: status.watchdog?.state ?? null,
    heartbeatHealth: heartbeatHealthBucket(status),
    terminal: terminal(status.status) ? status.status : null,
  });
}

export function shouldResetPollingBackoff(previous?: RuntimeStatus, next?: RuntimeStatus): boolean {
  return runtimeStatusFingerprint(previous) !== runtimeStatusFingerprint(next);
}
