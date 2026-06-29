import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeStore } from '../platform';
import { useConnectionStore, loadPersistedSettings } from './connection';

vi.mock('../platform', () => ({
  nativeStore: {
    loadSettings: vi.fn(() =>
      Promise.resolve({
        serverMode: 'local',
        serverUrl: 'http://localhost:45365',
        authMode: 'none',
        lastConnectedAt: null,
      })
    ),
    saveSettings: vi.fn(() => Promise.resolve()),
  },
}));

beforeEach(() => {
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    lastConnectedAt: null,
    connectionStatus: 'checking',
    connectionError: null,
  });
  vi.mocked(nativeStore.loadSettings).mockReset();
  vi.mocked(nativeStore.loadSettings).mockResolvedValue({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    lastConnectedAt: null,
  });
  vi.mocked(nativeStore.saveSettings).mockReset();
  vi.mocked(nativeStore.saveSettings).mockResolvedValue(undefined);
});

describe('useConnectionStore', () => {
  it('initializes with default local mode', () => {
    const { serverMode, serverUrl, connectionStatus, connectionError } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
    expect(connectionStatus).toBe('checking');
    expect(connectionError).toBeNull();
  });

  it('setConnectionStatus updates status', () => {
    useConnectionStore.getState().setConnectionStatus('connected');
    expect(useConnectionStore.getState().connectionStatus).toBe('connected');
  });

  it('setConnectionError updates the current connection error', () => {
    useConnectionStore.getState().setConnectionError('upgrade required');
    expect(useConnectionStore.getState().connectionError).toBe('upgrade required');
  });

  it('setServerMode persists settings through the platform store', async () => {
    await useConnectionStore.getState().setServerMode('external', 'http://remote:45365');

    expect(nativeStore.saveSettings).toHaveBeenCalledWith({
      serverMode: 'external',
      serverUrl: 'http://remote:45365',
      authMode: 'none',
      lastConnectedAt: null,
    });
    expect(useConnectionStore.getState().serverMode).toBe('external');
    expect(useConnectionStore.getState().serverUrl).toBe('http://remote:45365');
  });
});

describe('loadPersistedSettings', () => {
  it('keeps defaults when store is empty', async () => {
    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
  });

  it('loads persisted external mode', async () => {
    vi.mocked(nativeStore.loadSettings).mockResolvedValue({
      serverMode: 'external',
      serverUrl: 'http://myserver.local:45365',
      authMode: 'none',
      lastConnectedAt: null,
    });

    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('external');
    expect(serverUrl).toBe('http://myserver.local:45365');
  });
});
