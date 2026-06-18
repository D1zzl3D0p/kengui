import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { nativeCommands, nativeEvents, nativeStore } from './platform';
import { useConnectionStore } from './store/connection';
import { updateConfig } from './api/config';

vi.mock('./platform', () => ({
  nativeCommands: {
    checkServerRuntime: vi.fn(),
    spawnServer: vi.fn(),
    killServer: vi.fn(),
    serverStatus: vi.fn(),
    serverLogs: vi.fn(),
  },
  nativeEvents: {
    onServerReady: vi.fn(() => Promise.resolve(() => {})),
    onServerError: vi.fn(() => Promise.resolve(() => {})),
  },
  nativeStore: {
    loadSettings: vi.fn(() =>
      Promise.resolve({
        serverMode: 'local',
        serverUrl: 'http://localhost:45365',
      })
    ),
    saveSettings: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('./api/config', () => ({
  updateConfig: vi.fn(() => Promise.resolve({ config: {} })),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  window.history.pushState({}, '', '/');
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
    connectionError: null,
  });
  vi.mocked(nativeCommands.checkServerRuntime).mockReset();
  vi.mocked(nativeCommands.spawnServer).mockReset();
  vi.mocked(nativeCommands.spawnServer).mockResolvedValue(undefined);
  vi.mocked(nativeCommands.killServer).mockReset();
  vi.mocked(nativeCommands.killServer).mockResolvedValue(undefined);
  vi.mocked(nativeCommands.serverStatus).mockReset();
  vi.mocked(nativeCommands.serverLogs).mockReset();
  vi.mocked(nativeEvents.onServerReady).mockReset();
  vi.mocked(nativeEvents.onServerReady).mockResolvedValue(() => {});
  vi.mocked(nativeEvents.onServerError).mockReset();
  vi.mocked(nativeEvents.onServerError).mockResolvedValue(() => {});
  vi.mocked(updateConfig).mockReset();
  vi.mocked(updateConfig).mockResolvedValue({ config: {} });
  vi.mocked(nativeStore.loadSettings).mockReset();
  vi.mocked(nativeStore.loadSettings).mockResolvedValue({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
  });
  vi.mocked(nativeStore.saveSettings).mockReset();
  vi.mocked(nativeStore.saveSettings).mockResolvedValue(undefined);
  mockFetch.mockReset();
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8,
  });
  mockFetch.mockImplementation((url: string) => {
    if (url.endsWith('/health')) {
      return Promise.reject(new Error('connection refused'));
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'idle', is_running: false, items: [] }),
    });
  });
});

describe('App startup — local mode', () => {
  it('navigates to installing when kenkui not found', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(false);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/kenkui not found/i)).toBeInTheDocument();
    });
  });

  it('invokes spawn_server when kenkui is found', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);

    render(<App />);

    await waitFor(() => {
      expect(nativeCommands.spawnServer).toHaveBeenCalled();
    });
  });

  it('connects after kengui starts a local server and the health check succeeds', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    let healthCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        healthCalls += 1;
        if (healthCalls === 1) {
          return Promise.reject(new Error('connection refused'));
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'healthy',
              capabilities: [
                'local-queue',
                'single-voice',
                'multi-voice',
                'voices',
                'book-parse',
                'provider-models',
                'provider-credentials',
              ],
            }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'idle', is_running: false, items: [] }),
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /queue/i })).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:45365/health');
    expect(updateConfig).toHaveBeenCalledWith({ chapter_threads: 8 });
  });

  it('does not replace the dashboard with the connecting screen during a startup recheck', async () => {
    window.history.pushState({}, '', '/dashboard');
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    let healthCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        healthCalls += 1;
        if (healthCalls === 1) {
          return Promise.reject(new Error('connection refused'));
        }
        return new Promise(() => {});
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [],
            current_item: null,
            pending_count: 0,
            completed_count: 0,
            failed_count: 0,
          }),
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(nativeCommands.spawnServer).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: /queue/i })).toBeInTheDocument();
    expect(screen.queryByText(/starting kenkui/i)).not.toBeInTheDocument();
  });

  it('does not replace add book with the connecting screen during a startup recheck', async () => {
    window.history.pushState({}, '', '/add');
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    let healthCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        healthCalls += 1;
        if (healthCalls === 1) {
          return Promise.reject(new Error('connection refused'));
        }
        return new Promise(() => {});
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: /add book/i })).toBeInTheDocument();
    expect(screen.queryByText(/starting kenkui/i)).not.toBeInTheDocument();
  });

  it('stays on add book after local server health succeeds', async () => {
    window.history.pushState({}, '', '/add');
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.endsWith('/health')
              ? {
                  status: 'healthy',
                  capabilities: [
                    'local-queue',
                    'single-voice',
                    'multi-voice',
                    'voices',
                    'book-parse',
                    'provider-models',
                    'provider-credentials',
                  ],
                }
              : {}
          ),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add book/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/add');
  });

  it('attaches to an already running compatible local runtime without spawning', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.endsWith('/health')
              ? {
                  status: 'healthy',
                  capabilities: [
                    'local-queue',
                    'single-voice',
                    'multi-voice',
                    'voices',
                    'book-parse',
                    'provider-models',
                    'provider-credentials',
                  ],
                }
              : { status: 'idle', is_running: false, items: [] }
          ),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /queue/i })).toBeInTheDocument();
    });

    expect(nativeCommands.spawnServer).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('attaches to an older local runtime without provider model discovery', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.endsWith('/health')
              ? {
                  status: 'healthy',
                  capabilities: ['local-queue', 'single-voice', 'multi-voice', 'voices', 'book-parse'],
                }
              : {}
          ),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /queue/i })).toBeInTheDocument();
    });

    expect(nativeCommands.spawnServer).not.toHaveBeenCalled();
  });
});
