import { beforeEach, describe, expect, it } from 'vitest';
import { formatRequestedLocalChapterThreads, getRequestedLocalChapterThreads } from './threadBudget';

beforeEach(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8,
  });
});

describe('threadBudget', () => {
  it('uses the reported hardware thread count', () => {
    expect(getRequestedLocalChapterThreads()).toBe(8);
  });

  it('falls back to one thread when hardware concurrency is unavailable', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: undefined,
    });

    expect(getRequestedLocalChapterThreads()).toBe(1);
  });

  it('formats the thread request for display', () => {
    expect(formatRequestedLocalChapterThreads(1)).toBe('1 thread');
    expect(formatRequestedLocalChapterThreads(8)).toBe('8 threads');
  });
});
