import type { RuntimeStatus } from '../api/queue';
import { heartbeatHealthBucket } from '../lib/pollingBackoff';

export type RunHealth = 'healthy' | 'working' | 'stalled' | 'retrying';

/**
 * At-a-glance health of an in-flight run, derived from the structured runtime
 * status. Returns null when there is nothing meaningful to say (no heartbeat
 * telemetry, or a terminal job whose StatusBadge already tells the story).
 *
 * - retrying: watchdog is re-running the job, or a retry is scheduled ahead.
 * - stalled:  heartbeat/watchdog says the worker is not making progress.
 * - working:  worker is alive but has been quiet (no recent progress update).
 * - healthy:  fresh heartbeat and recent progress.
 */
export function deriveRunHealth(runtime: RuntimeStatus | undefined): RunHealth | null {
  if (!runtime) return null;
  const retryScheduled = runtime.attempt?.nextAttemptAt
    ? Date.parse(runtime.attempt.nextAttemptAt) > Date.now()
    : false;
  if (runtime.watchdog?.state === 'recovered_retrying' || retryScheduled) return 'retrying';
  const bucket = heartbeatHealthBucket(runtime);
  if (bucket === 'stale' || runtime.watchdog?.state === 'stale') return 'stalled';
  if (bucket === 'alive-quiet') return 'working';
  if (bucket === 'fresh') return 'healthy';
  return null;
}

const HEALTH_META: Record<RunHealth, { label: string; className: string }> = {
  healthy: {
    label: 'Healthy',
    className:
      'bg-[rgb(111_138_101_/_18%)] text-[var(--color-success)] border-[rgb(111_138_101_/_32%)]',
  },
  working: {
    label: 'Working',
    className:
      'bg-[rgb(47_111_106_/_16%)] text-[var(--color-muted-teal)] border-[rgb(47_111_106_/_28%)]',
  },
  stalled: {
    label: 'Stalled',
    className:
      'bg-[rgb(169_81_67_/_15%)] text-[var(--color-error)] border-[rgb(169_81_67_/_30%)]',
  },
  retrying: {
    label: 'Retrying',
    className:
      'bg-[rgb(184_155_77_/_18%)] text-[var(--color-ink)] border-[rgb(184_155_77_/_35%)]',
  },
};

export function RunHealthBadge({ runtime }: { runtime: RuntimeStatus | undefined }) {
  const health = deriveRunHealth(runtime);
  if (!health) return null;
  const meta = HEALTH_META[health];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
