import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { deriveRunHealth, RunHealthBadge } from './RunHealthBadge';
import type { RuntimeStatus } from '../api/queue';

const base = (overrides: Partial<RuntimeStatus>): RuntimeStatus => ({
  status: 'processing',
  heartbeat: { ageSeconds: 2, timeoutSeconds: 60 },
  progress: { ageSeconds: 2 },
  ...overrides,
});

describe('deriveRunHealth', () => {
  it('returns null when there is no runtime status', () => {
    expect(deriveRunHealth(undefined)).toBeNull();
  });

  it('returns null when there is no heartbeat telemetry to judge', () => {
    expect(deriveRunHealth({ status: 'processing', progress: { percent: 50 } })).toBeNull();
  });

  it('is healthy with a fresh heartbeat and recent progress', () => {
    expect(deriveRunHealth(base({}))).toBe('healthy');
  });

  it('is working when alive but progress has gone quiet', () => {
    expect(
      deriveRunHealth(base({ progress: { ageSeconds: 120 } })),
    ).toBe('working');
  });

  it('is stalled when the heartbeat is older than its timeout', () => {
    expect(
      deriveRunHealth(base({ heartbeat: { ageSeconds: 120, timeoutSeconds: 60 } })),
    ).toBe('stalled');
  });

  it('is stalled when the watchdog marks the worker stale', () => {
    expect(deriveRunHealth(base({ watchdog: { state: 'stale' } }))).toBe('stalled');
  });

  it('is retrying when the watchdog recovered and is re-running', () => {
    expect(
      deriveRunHealth(base({ watchdog: { state: 'recovered_retrying' } })),
    ).toBe('retrying');
  });

  it('is retrying when a retry is scheduled in the future', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    expect(
      deriveRunHealth(base({ attempt: { current: 1, max: 3, nextAttemptAt: future } })),
    ).toBe('retrying');
  });
});

describe('RunHealthBadge', () => {
  it('renders nothing when health is not applicable', () => {
    const { container } = render(<RunHealthBadge runtime={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the health label when applicable', () => {
    render(<RunHealthBadge runtime={base({})} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });
});
