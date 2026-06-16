import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { useConnectionStore } from '../store/connection';
import { createRuntimeAdapter } from '../runtime/runtime';

vi.mock('../runtime/runtime', () => ({
  createRuntimeAdapter: vi.fn(),
}));

const runtime = {
  health: vi.fn(),
  status: vi.fn(),
  logs: vi.fn(),
  restart: vi.fn(),
};

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
  });
  runtime.health.mockResolvedValue({
    status: 'healthy',
    server_version: '0.1.0',
    api_version: 'v1',
  });
  runtime.status.mockResolvedValue({
    available: true,
    running: true,
    pid: 123,
    last_error: null,
    log_tail: ['INFO: fallback status log'],
  });
  runtime.logs.mockResolvedValue([
    'INFO: server started',
    'WARNING: slow provider',
    'ERROR: failed callback',
  ]);
  runtime.restart.mockResolvedValue(undefined);
  vi.mocked(createRuntimeAdapter).mockReturnValue(runtime as never);
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe('Settings', () => {
  it('shows local mode selected by default', () => {
    renderSettings();
    const localRadio = screen.getByLabelText(/local/i);
    expect(localRadio).toBeChecked();
  });

  it('shows URL input when external mode radio is clicked', async () => {
    renderSettings();
    await userEvent.click(screen.getByLabelText(/external/i));
    expect(screen.getByPlaceholderText(/http/i)).toBeInTheDocument();
  });

  it('shows runtime diagnostics and full logs', async () => {
    renderSettings();

    expect(await screen.findByText('healthy')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Running (123)')).toBeInTheDocument();
    expect(screen.getByText(/ERROR: failed callback/)).toBeInTheDocument();
    expect(runtime.logs).toHaveBeenCalled();
  });

  it('filters logs by severity', async () => {
    renderSettings();
    await screen.findByText(/ERROR: failed callback/);

    await userEvent.selectOptions(screen.getByLabelText(/log severity/i), 'warning');

    expect(screen.getByText(/WARNING: slow provider/)).toBeInTheDocument();
    expect(screen.queryByText(/ERROR: failed callback/)).not.toBeInTheDocument();
  });

  it('copies visible logs', async () => {
    renderSettings();
    await screen.findByText(/ERROR: failed callback/);

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      ['ERROR: failed callback', 'WARNING: slow provider', 'INFO: server started'].join('\n')
    );
  });

  it('restarts the local server and refreshes diagnostics', async () => {
    renderSettings();
    await screen.findByText('healthy');
    const healthCallsBeforeRestart = runtime.health.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: /restart local server/i }));

    expect(runtime.restart).toHaveBeenCalled();
    expect(runtime.health.mock.calls.length).toBeGreaterThan(healthCallsBeforeRestart);
  });
});
