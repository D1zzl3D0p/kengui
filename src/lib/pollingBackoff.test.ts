import { describe, expect, it } from 'vitest';
import { computeBackoffInterval } from './pollingBackoff';

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
