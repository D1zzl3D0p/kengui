import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import App from './App';
import { useConnectionStore } from './store/connection';

beforeEach(() => {
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
  });
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockResolvedValue(() => {});
});

describe('App startup — local mode', () => {
  it('navigates to installing when kenkui not found', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'check_kenkui') return Promise.resolve(false);
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/kenkui not found/i)).toBeInTheDocument();
    });
  });

  it('invokes spawn_server when kenkui is found', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'check_kenkui') return Promise.resolve(true);
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('spawn_server');
    });
  });
});
