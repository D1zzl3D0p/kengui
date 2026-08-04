import { describe, expect, it } from 'vitest';
import { computeBackoffInterval, heartbeatHealthBucket, runtimeStatusFingerprint, shouldResetPollingBackoff } from './pollingBackoff';
import type { RuntimeStatus } from '../api/queue';

describe('computeBackoffInterval', () => {
  it('returns initial interval when consecutiveUnchanged is 0', () => {
    expect(computeBackoffInterval(0)).toBe(900);
  });

  it('returns initial * factor when consecutiveUnchanged is 1', () => {
    // 900 * 1.8 = 1620
    expect(computeBackoffInterval(1)).toBe(900 * 1.8);
  });

  it('returns initial * factor^2 when consecutiveUnchanged is 2', () => {
    // 900 * 1.8^2 = 2916
    expect(computeBackoffInterval(2)).toBe(900 * 1.8 * 1.8);
  });

  it('never exceeds cap for large consecutiveUnchanged', () => {
    expect(computeBackoffInterval(100)).toBe(8000);
    expect(computeBackoffInterval(50)).toBe(8000);
  });

  it('resets to initial when consecutiveUnchanged is 0 again', () => {
    // verify multiple calls are independent (pure function, no state)
    computeBackoffInterval(10);
    computeBackoffInterval(20);
    expect(computeBackoffInterval(0)).toBe(900);
  });

  it('respects custom initial option', () => {
    expect(computeBackoffInterval(0, { initial: 2000 })).toBe(2000);
  });

  it('respects custom factor option', () => {
    expect(computeBackoffInterval(1, { initial: 1000, factor: 2 })).toBe(2000);
  });

  it('respects custom cap option', () => {
    expect(computeBackoffInterval(100, { cap: 5000 })).toBe(5000);
  });

  it('caps at custom cap before hitting default cap', () => {
    // With initial=2000, factor=1.8, cap=3000: 2000*1.8=3600 > 3000, so capped
    expect(computeBackoffInterval(1, { initial: 2000, factor: 1.8, cap: 3000 })).toBe(3000);
  });

  it('returns a number (never NaN or Infinity)', () => {
    const result = computeBackoffInterval(999);
    expect(Number.isFinite(result)).toBe(true);
  });
});

const runtime = (overrides: Partial<RuntimeStatus> = {}): RuntimeStatus => ({
  status: 'running', observedAt: '2026-08-04T01:00:00Z',
  attempt: { current: 1, max: 3 },
  progress: { stage: 'render', percent: 10, updatedAt: '2026-08-04T00:59:50Z', ageSeconds: 10 },
  heartbeat: { at: '2026-08-04T00:59:58Z', ageSeconds: 2, timeoutSeconds: 60 },
  watchdog: { state: 'healthy' }, ...overrides,
});

describe('semantic runtime polling changes', () => {
  it('ignores status labels, observations, heartbeat timestamps, and age ticks alone', () => {
    const previous = runtime();
    const next = runtime({ status: 'busy', observedAt: '2026-08-04T01:00:05Z',
      heartbeat: { at: '2026-08-04T01:00:03Z', ageSeconds: 7, timeoutSeconds: 60 } });
    expect(runtimeStatusFingerprint(next)).toBe(runtimeStatusFingerprint(previous));
    expect(shouldResetPollingBackoff(previous, next)).toBe(false);
  });

  it.each([
    ['progress timestamp', runtime({ progress: { ...runtime().progress!, updatedAt: '2026-08-04T01:00:01Z' } })],
    ['progress stage', runtime({ progress: { ...runtime().progress!, stage: 'package' } })],
    ['progress percent', runtime({ progress: { ...runtime().progress!, percent: 11 } })],
    ['attempt', runtime({ attempt: { current: 2, max: 3 } })],
    ['retry schedule', runtime({ attempt: { current: 1, max: 3, nextAttemptAt: '2026-08-04T01:01:00Z' } })],
    ['watchdog', runtime({ watchdog: { state: 'recovered_retrying' } })],
    ['heartbeat health bucket', runtime({ progress: { ...runtime().progress!, ageSeconds: 90 } })],
    ['terminal transition', runtime({ status: 'failed' })],
  ])('resets on %s', (_name, next) => expect(shouldResetPollingBackoff(runtime(), next)).toBe(true));

  it('defines server-derived heartbeat health buckets', () => {
    expect(heartbeatHealthBucket(runtime())).toBe('fresh');
    expect(heartbeatHealthBucket(runtime({ progress: { ...runtime().progress!, ageSeconds: 61 } }))).toBe('alive-quiet');
    expect(heartbeatHealthBucket(runtime({ heartbeat: { ...runtime().heartbeat!, ageSeconds: 61 } }))).toBe('stale');
    expect(heartbeatHealthBucket(runtime({ watchdog: { state: 'not_applicable' }, heartbeat: undefined }))).toBe('not-applicable');
    expect(heartbeatHealthBucket(runtime({ watchdog: { state: 'recovered_failed' }, heartbeat: { ...runtime().heartbeat!, ageSeconds: 999 } }))).toBe('not-applicable');
  });
});
