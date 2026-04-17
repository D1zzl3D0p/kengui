import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConnectionStore, loadPersistedSettings } from './connection';

beforeEach(() => {
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
  });
});

describe('useConnectionStore', () => {
  it('initializes with default local mode', () => {
    const { serverMode, serverUrl, connectionStatus } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
    expect(connectionStatus).toBe('checking');
  });

  it('setConnectionStatus updates status', () => {
    useConnectionStore.getState().setConnectionStatus('connected');
    expect(useConnectionStore.getState().connectionStatus).toBe('connected');
  });

  it('setServerMode persists to Tauri store', async () => {
    const { load } = await import('@tauri-apps/plugin-store');
    const mockSet = vi.fn(() => Promise.resolve());
    const mockSave = vi.fn(() => Promise.resolve());
    vi.mocked(load).mockResolvedValue({
      get: vi.fn(() => Promise.resolve(null)),
      set: mockSet,
      save: mockSave,
    } as any);

    await useConnectionStore.getState().setServerMode('external', 'http://remote:45365');

    expect(mockSet).toHaveBeenCalledWith('serverMode', 'external');
    expect(mockSet).toHaveBeenCalledWith('serverUrl', 'http://remote:45365');
    expect(mockSave).toHaveBeenCalled();
    expect(useConnectionStore.getState().serverMode).toBe('external');
    expect(useConnectionStore.getState().serverUrl).toBe('http://remote:45365');
  });
});

describe('loadPersistedSettings', () => {
  it('keeps defaults when store is empty', async () => {
    const { load } = await import('@tauri-apps/plugin-store');
    vi.mocked(load).mockResolvedValue({
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(),
      save: vi.fn(),
    } as any);

    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
  });

  it('loads persisted external mode', async () => {
    const { load } = await import('@tauri-apps/plugin-store');
    vi.mocked(load).mockResolvedValue({
      get: vi.fn((key: string) => {
        if (key === 'serverMode') return Promise.resolve('external');
        if (key === 'serverUrl') return Promise.resolve('http://myserver.local:45365');
        return Promise.resolve(null);
      }),
      set: vi.fn(),
      save: vi.fn(),
    } as any);

    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('external');
    expect(serverUrl).toBe('http://myserver.local:45365');
  });
});
