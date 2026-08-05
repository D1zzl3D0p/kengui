import { describe, it, expect } from 'vitest';
import { shouldWarnHighWorkers } from './workerWarning';

describe('shouldWarnHighWorkers', () => {
  it('does not warn at or below the threshold in local mode', () => {
    expect(shouldWarnHighWorkers('local', 16)).toBe(false);
  });
  it('warns above the threshold in local mode', () => {
    expect(shouldWarnHighWorkers('local', 17)).toBe(true);
  });
  it('never warns in hosted mode', () => {
    expect(shouldWarnHighWorkers('hosted', 64)).toBe(false);
  });
  it('handles non-finite values as no warning', () => {
    expect(shouldWarnHighWorkers('local', Number.NaN)).toBe(false);
  });
});
