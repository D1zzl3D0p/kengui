import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeCommands } from './nativeCommands';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('nativeCommands', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('maps runtime methods to Tauri command names', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await nativeCommands.checkServerRuntime();
    await nativeCommands.spawnServer();
    await nativeCommands.killServer();
    await nativeCommands.serverStatus();
    await nativeCommands.serverLogs();

    expect(invoke).toHaveBeenCalledWith('check_server_runtime');
    expect(invoke).toHaveBeenCalledWith('spawn_server');
    expect(invoke).toHaveBeenCalledWith('kill_server');
    expect(invoke).toHaveBeenCalledWith('server_status');
    expect(invoke).toHaveBeenCalledWith('server_logs');
  });

  it('uses safe fallbacks when Tauri commands are unavailable', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('unavailable'));

    await expect(nativeCommands.checkServerRuntime()).resolves.toBe(false);
    await expect(nativeCommands.spawnServer()).resolves.toBeUndefined();
    await expect(nativeCommands.serverLogs()).resolves.toEqual([]);
    await expect(nativeCommands.serverStatus()).resolves.toMatchObject({
      available: false,
      running: false,
    });
  });
});
