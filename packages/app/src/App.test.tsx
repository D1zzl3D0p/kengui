import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { nativeCommands, nativeEvents, nativeStore } from './platform';
import { useConnectionStore } from './store/connection';

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
  deepLinks: {
    onAuthCallback: vi.fn(() => Promise.resolve(() => {})),
  },
  authCallback: {
    prepareAuthRedirectUrl: vi.fn(() => Promise.resolve(null)),
  },
  externalUrl: {
    openExternalUrl: vi.fn(() => Promise.resolve()),
  },
  secureKv: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
  },
  nativeStore: {
    loadSettings: vi.fn(() =>
      Promise.resolve({
        serverMode: 'local',
        serverUrl: 'http://localhost:45365',
        authMode: 'none',
        computeTarget: 'local',
        lastConnectedAt: '2026-01-01T00:00:00.000Z',
      })
    ),
    saveSettings: vi.fn(() => Promise.resolve()),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  window.history.pushState({}, '', '/');
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    computeTarget: 'local',
    lastConnectedAt: '2026-01-01T00:00:00.000Z',
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
  vi.mocked(nativeStore.loadSettings).mockReset();
  vi.mocked(nativeStore.loadSettings).mockResolvedValue({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    computeTarget: 'local',
    lastConnectedAt: '2026-01-01T00:00:00.000Z',
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
  it('navigates to connect when kenkui is not found', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(false);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /connect to kenkui/i })).toBeInTheDocument();
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
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/health',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(nativeCommands.spawnServer).toHaveBeenCalledTimes(1);
  });

  it('does not replace the dashboard with the connecting screen during a startup recheck', async () => {
    window.history.pushState({}, '', '/dashboard');
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(true);
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('/health')) {
        // Dashboard and startup health probes race in the full suite. Fail every
        // pre-spawn probe so this deterministically exercises managed startup,
        // then leave post-spawn readiness pending.
        if (vi.mocked(nativeCommands.spawnServer).mock.calls.length === 0) {
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

    await waitFor(
      () => {
        expect(nativeCommands.spawnServer).toHaveBeenCalled();
      },
      { timeout: 3_000 }
    );

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
              : { items: [], current_item: null, pending_count: 0, completed_count: 0, failed_count: 0 }
          ),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add book/i })).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/add');
  });

  it('keeps an explicit connect route open even with a saved profile', async () => {
    window.history.pushState({}, '', '/connect');
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
              : { items: [], current_item: null, pending_count: 0, completed_count: 0, failed_count: 0 }
          ),
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:45365/health',
        expect.objectContaining({ headers: expect.any(Headers) })
      );
    });
    expect(screen.getByRole('heading', { name: /connect to kenkui/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/connect');
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
  });

  it('attaches to an already running local runtime even when no executable is discoverable', async () => {
    vi.mocked(nativeCommands.checkServerRuntime).mockResolvedValue(false);
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

    expect(nativeCommands.checkServerRuntime).not.toHaveBeenCalled();
    expect(nativeCommands.spawnServer).not.toHaveBeenCalled();
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
              : { items: [], current_item: null, pending_count: 0, completed_count: 0, failed_count: 0 }
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
