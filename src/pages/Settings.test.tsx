import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { useConnectionStore } from '../store/connection';
import { createRuntimeAdapter } from '../runtime/runtime';
import { fetchConfig, patchConfig } from '../api/config';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
  updateProviderCredentials,
} from '../api/credentials';

vi.mock('../runtime/runtime', () => ({
  createRuntimeAdapter: vi.fn(),
}));

vi.mock('../api/config', () => ({
  fetchConfig: vi.fn(),
  patchConfig: vi.fn(),
}));

vi.mock('../api/credentials', () => ({
  fetchProviderCredentials: vi.fn(),
  updateProviderCredentials: vi.fn(),
  deleteProviderCredentials: vi.fn(),
}));

const runtime = {
  health: vi.fn(),
  status: vi.fn(),
  logs: vi.fn(),
  stop: vi.fn(),
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
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8,
  });
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
  runtime.stop.mockResolvedValue(undefined);
  runtime.restart.mockResolvedValue(undefined);
  vi.mocked(createRuntimeAdapter).mockReturnValue(runtime as never);
  vi.mocked(fetchConfig).mockResolvedValue({
    config: {
      default_voice: 'alba',
      default_output_dir: '/tmp/audio',
      workers: 4,
      m4b_bitrate: '96k',
      pause_line_ms: 800,
      pause_chapter_ms: 2000,
      nlp_provider: 'ollama',
      nlp_model: 'llama3.2',
      ollama_url: 'http://localhost:11434',
      nlp_discovery_method: 'auto',
    },
  });
  vi.mocked(patchConfig).mockResolvedValue({
    config: {
      default_voice: 'clara',
      default_output_dir: '/tmp/audio',
      workers: 4,
      m4b_bitrate: '96k',
      pause_line_ms: 800,
      pause_chapter_ms: 2000,
      nlp_provider: 'ollama',
      nlp_model: 'llama3.2',
      ollama_url: 'http://localhost:11434',
      nlp_discovery_method: 'auto',
    },
  });
  vi.mocked(fetchProviderCredentials).mockResolvedValue({
    providers: [
      {
        provider: 'openai',
        configured: true,
        default_model: 'gpt-4o',
        masked_key_hint: 'sk-t...1234',
      },
    ],
  });
  vi.mocked(updateProviderCredentials).mockResolvedValue({
    provider: 'openai',
    configured: true,
    default_model: 'gpt-4.1-mini',
    masked_key_hint: 'sk-n...5678',
  });
  vi.mocked(deleteProviderCredentials).mockResolvedValue(undefined);
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
    expect(
      screen.getByText(/local runs request all available CPU threads/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Requested 8 threads/i)).toBeInTheDocument();
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

  it('stops the local server before saving a non-local mode', async () => {
    renderSettings();
    await screen.findByText('healthy');

    await userEvent.click(screen.getByLabelText(/external/i));
    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(runtime.stop).toHaveBeenCalled();
    expect(useConnectionStore.getState().serverMode).toBe('external');
  });

  it('edits and saves structured config fields', async () => {
    renderSettings();

    const voiceInput = await screen.findByDisplayValue('alba');
    await userEvent.clear(voiceInput);
    await userEvent.type(voiceInput, 'clara');
    await userEvent.click(screen.getByRole('button', { name: /save config/i }));

    expect(patchConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        default_voice: 'clara',
        workers: 4,
        pause_line_ms: 800,
      })
    );
  });

  it('shows masked credentials and updates without key readback', async () => {
    renderSettings();

    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/configured sk-t...1234/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/preserve existing key/i), 'sk-new-5678');
    const modelInput = screen.getByDisplayValue('gpt-4o');
    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, 'gpt-4.1-mini');
    await userEvent.click(screen.getByRole('button', { name: /update/i }));

    expect(updateProviderCredentials).toHaveBeenCalledWith('openai', {
      api_key: 'sk-new-5678',
      default_model: 'gpt-4.1-mini',
    });
  });
});
