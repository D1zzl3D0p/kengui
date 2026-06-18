import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeCommands } from '../platform';
import {
  createRuntimeAdapter,
  supportsProviderCredentials,
  supportsProviderModels,
  waitForRuntimeHealth,
} from './runtime';

vi.mock('../platform', () => ({
  nativeCommands: {
    checkServerRuntime: vi.fn(),
    spawnServer: vi.fn(),
    killServer: vi.fn(),
    serverStatus: vi.fn(),
    serverLogs: vi.fn(),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('createRuntimeAdapter', () => {
  beforeEach(() => {
    vi.mocked(nativeCommands.checkServerRuntime).mockReset();
    vi.mocked(nativeCommands.spawnServer).mockReset();
    vi.mocked(nativeCommands.killServer).mockReset();
    vi.mocked(nativeCommands.serverStatus).mockReset();
    vi.mocked(nativeCommands.serverLogs).mockReset();
    mockFetch.mockReset();
  });

  it('uses native commands for local runtime lifecycle', async () => {
    vi.mocked(nativeCommands.spawnServer).mockResolvedValue(undefined);
    vi.mocked(nativeCommands.killServer).mockResolvedValue(undefined);
    vi.mocked(nativeCommands.serverStatus).mockResolvedValue({
      available: true,
      running: true,
      pid: 123,
      last_error: null,
      port_owner: null,
      log_tail: [],
    });
    vi.mocked(nativeCommands.serverLogs).mockResolvedValue([]);
    const runtime = createRuntimeAdapter('local', 'http://localhost:45365');

    await runtime.start();
    await runtime.stop();
    await runtime.status();
    await runtime.logs();

    expect(nativeCommands.spawnServer).toHaveBeenCalled();
    expect(nativeCommands.killServer).toHaveBeenCalled();
    expect(nativeCommands.serverStatus).toHaveBeenCalled();
    expect(nativeCommands.serverLogs).toHaveBeenCalled();
  });

  it('checks health over HTTP for external runtime', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy' }),
    });
    const runtime = createRuntimeAdapter('external', 'http://server.local:45365');

    await expect(runtime.health()).resolves.toEqual({ status: 'healthy' });

    expect(mockFetch).toHaveBeenCalledWith('http://server.local:45365/health');
    expect(nativeCommands.spawnServer).not.toHaveBeenCalled();
  });

  it('allows local runtimes without optional provider model discovery', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'healthy',
        capabilities: ['local-queue', 'single-voice', 'voices', 'book-parse'],
      }),
    });
    const runtime = createRuntimeAdapter('local', 'http://localhost:45365');

    await expect(runtime.health()).resolves.toMatchObject({ status: 'healthy' });
  });

  it('allows external runtimes with older capability sets', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'healthy',
        capabilities: ['local-queue', 'single-voice', 'voices', 'book-parse'],
      }),
    });
    const runtime = createRuntimeAdapter('external', 'http://server.local:45365');

    await expect(runtime.health()).resolves.toMatchObject({ status: 'healthy' });
  });

  it('recognizes provider capability flags from health responses', () => {
    expect(
      supportsProviderModels({ status: 'healthy', capabilities: ['provider-models'] })
    ).toBe(true);
    expect(
      supportsProviderCredentials({ status: 'healthy', capabilities: ['provider-credentials'] })
    ).toBe(true);
    expect(supportsProviderModels({ status: 'healthy', capabilities: [] })).toBe(false);
  });

  it('retries health checks until the runtime is available', async () => {
    const runtime = {
      health: vi
        .fn()
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce({ status: 'healthy' }),
    };

    await expect(
      waitForRuntimeHealth(runtime, { timeoutMs: 100, intervalMs: 0 })
    ).resolves.toEqual({ status: 'healthy' });

    expect(runtime.health).toHaveBeenCalledTimes(2);
  });
});
