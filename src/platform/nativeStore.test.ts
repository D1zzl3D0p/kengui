import { load } from '@tauri-apps/plugin-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeStore } from './nativeStore';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(),
}));

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('nativeStore', () => {
  const storage = createStorage();

  beforeEach(() => {
    vi.mocked(load).mockReset();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();
  });

  it('loads settings from the Tauri store', async () => {
    vi.mocked(load).mockResolvedValue({
      get: vi.fn((key: string) => {
        if (key === 'serverMode') return Promise.resolve('external');
        if (key === 'serverUrl') return Promise.resolve('http://remote:45365');
        return Promise.resolve(null);
      }),
      set: vi.fn(),
      save: vi.fn(),
    } as any);

    await expect(nativeStore.loadSettings()).resolves.toEqual({
      serverMode: 'external',
      serverUrl: 'http://remote:45365',
      authMode: 'none',
      lastConnectedAt: null,
    });
  });

  it('saves settings through the Tauri store', async () => {
    const set = vi.fn(() => Promise.resolve());
    const save = vi.fn(() => Promise.resolve());
    vi.mocked(load).mockResolvedValue({
      get: vi.fn(),
      set,
      save,
    } as any);

    await nativeStore.saveSettings({
      serverMode: 'hosted',
      serverUrl: 'https://api.kengui.app',
      authMode: 'supabase',
      lastConnectedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(set).toHaveBeenCalledWith('serverMode', 'hosted');
    expect(set).toHaveBeenCalledWith('serverUrl', 'https://api.kengui.app');
    expect(set).toHaveBeenCalledWith('authMode', 'supabase');
    expect(set).toHaveBeenCalledWith('lastConnectedAt', '2026-01-01T00:00:00.000Z');
    expect(save).toHaveBeenCalled();
  });

  it('falls back to localStorage when the Tauri store is unavailable', async () => {
    vi.mocked(load).mockRejectedValue(new Error('unavailable'));
    localStorage.setItem('serverMode', 'external');
    localStorage.setItem('serverUrl', 'http://dev-server:45365');

    await expect(nativeStore.loadSettings()).resolves.toEqual({
      serverMode: 'external',
      serverUrl: 'http://dev-server:45365',
      authMode: 'none',
      lastConnectedAt: null,
    });

    await nativeStore.saveSettings({
      serverMode: 'local',
      serverUrl: 'http://localhost:45365',
      authMode: 'none',
      lastConnectedAt: null,
    });

    expect(localStorage.getItem('serverMode')).toBe('local');
    expect(localStorage.getItem('serverUrl')).toBe('http://localhost:45365');
  });
});
