import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { useConnectionStore } from '../store/connection';
import {
  createRuntimeAdapter,
  supportsProviderCredentials,
  supportsProviderModels,
} from '../runtime/runtime';
import { fetchConfig, patchConfig } from '../api/config';
import { fetchVoices } from '../api/voices';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
  testProviderCredentials,
  updateProviderCredentials,
} from '../api/credentials';
import { useProviderModels } from '../hooks/useProviderModels';
import {
  clearAuthSession,
  exchangeSupabaseCode,
  loadAuthSessionSummary,
} from '../auth/supabase';
import { beginSupabaseOAuth } from '../auth/oauthStart';
import { deepLinks } from '../platform';

vi.mock('../runtime/runtime', () => ({
  createRuntimeAdapter: vi.fn(),
  supportsProviderModels: vi.fn(() => true),
  supportsProviderCredentials: vi.fn(() => true),
}));

vi.mock('../api/config', () => ({
  fetchConfig: vi.fn(),
  patchConfig: vi.fn(),
}));

vi.mock('../api/voices', () => ({
  fetchVoices: vi.fn(),
}));

vi.mock('../api/credentials', () => ({
  fetchProviderCredentials: vi.fn(),
  updateProviderCredentials: vi.fn(),
  deleteProviderCredentials: vi.fn(),
  testProviderCredentials: vi.fn(),
  isProviderCredentialsUnsupportedError: vi.fn(() => false),
}));

vi.mock('../hooks/useProviderModels', () => ({
  useProviderModels: vi.fn(),
}));

vi.mock('../auth/supabase', () => ({
  clearAuthSession: vi.fn(),
  exchangeSupabaseCode: vi.fn(),
  loadAuthSessionSummary: vi.fn(),
}));

vi.mock('../auth/oauthStart', () => ({
  beginSupabaseOAuth: vi.fn(),
}));

vi.mock('../platform', () => ({
  deepLinks: {
    onAuthCallback: vi.fn(),
  },
  nativeStore: {
    loadSettings: vi.fn(() => Promise.resolve({
      serverMode: 'local',
      serverUrl: 'http://localhost:45365',
      authMode: 'none',
      computeTarget: 'local',
      lastConnectedAt: null,
    })),
    saveSettings: vi.fn(() => Promise.resolve()),
  },
}));

const runtime = {
  health: vi.fn(),
  status: vi.fn(),
  logs: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
};

const mockFetchVoices = fetchVoices as ReturnType<typeof vi.fn>;
const mockUpdateProviderCredentials = updateProviderCredentials as ReturnType<typeof vi.fn>;
const mockDeleteProviderCredentials = deleteProviderCredentials as ReturnType<typeof vi.fn>;
const mockTestProviderCredentials = testProviderCredentials as ReturnType<typeof vi.fn>;
const mockUseProviderModels = useProviderModels as ReturnType<typeof vi.fn>;
const mockSupportsProviderModels = supportsProviderModels as ReturnType<typeof vi.fn>;
const mockSupportsProviderCredentials = supportsProviderCredentials as ReturnType<typeof vi.fn>;
const mockLoadAuthSessionSummary = loadAuthSessionSummary as ReturnType<typeof vi.fn>;
const mockClearAuthSession = clearAuthSession as ReturnType<typeof vi.fn>;
const mockExchangeSupabaseCode = exchangeSupabaseCode as ReturnType<typeof vi.fn>;
const mockBeginSupabaseOAuth = beginSupabaseOAuth as ReturnType<typeof vi.fn>;
const mockOnAuthCallback = deepLinks.onAuthCallback as ReturnType<typeof vi.fn>;

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
    authMode: 'none',
    computeTarget: 'local',
    connectionStatus: 'checking',
    connectionError: null,
  });
  runtime.health.mockResolvedValue({
    status: 'healthy',
    server_version: '0.1.0',
    api_version: 'v1',
    capabilities: ['provider-models', 'provider-credentials'],
  });
  runtime.status.mockResolvedValue({
    available: true,
    running: true,
    pid: 123,
    last_error: null,
    port_owner: null,
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
  mockSupportsProviderModels.mockReturnValue(true);
  mockSupportsProviderCredentials.mockReturnValue(true);
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
  mockFetchVoices.mockResolvedValue({
    total: 2,
    voices: [
      {
        name: 'alba',
        source: 'coqui',
        gender: 'female',
        accent: 'en-us',
        dataset: null,
        speaker_id: null,
        description: 'Clear female voice',
        display_label: 'Alba (female, en-us)',
        excluded: false,
      },
      {
        name: 'clara',
        source: 'coqui',
        gender: 'female',
        accent: 'en-gb',
        dataset: null,
        speaker_id: null,
        description: 'British female voice',
        display_label: 'Clara (female, en-gb)',
        excluded: false,
      },
    ],
  });
  mockUseProviderModels.mockReturnValue({
    models: ['gpt-4o', 'gpt-4.1-mini', 'llama3.2'],
    loading: false,
    error: null,
  });
  mockUpdateProviderCredentials.mockResolvedValue({
    provider: 'openai',
    configured: true,
    default_model: 'gpt-4.1-mini',
    masked_key_hint: 'sk-n...5678',
  });
  mockDeleteProviderCredentials.mockResolvedValue(undefined);
  mockTestProviderCredentials.mockResolvedValue({ status: 'ok', message: 'Validated' });
  mockLoadAuthSessionSummary.mockResolvedValue(null);
  mockClearAuthSession.mockResolvedValue(undefined);
  mockExchangeSupabaseCode.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 123,
    email: 'reader@example.com',
    provider: 'github',
  });
  mockBeginSupabaseOAuth.mockResolvedValue(undefined);
  mockOnAuthCallback.mockResolvedValue(() => {});
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe('Settings', () => {
  it('shows local mode selected by default', () => {
    renderSettings();
    const localRadio = screen.getByLabelText('Local (managed)');
    expect(localRadio).toBeChecked();
  });

  it('shows URL input when external mode radio is clicked', async () => {
    renderSettings();
    await userEvent.click(screen.getByLabelText(/external/i));
    expect(screen.getByPlaceholderText(/http/i)).toBeInTheDocument();
  });

  it('shows hosted cloud mode when hosted runtime is enabled', () => {
    renderSettings();
    expect(screen.getByLabelText('Kengui Cloud')).toBeInTheDocument();
  });

  it('renders cloud account controls with Google, GitHub, and Apple sign in', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    renderSettings();

    expect(await screen.findByRole('heading', { name: /cloud account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in before cloud submission/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));

    expect(beginSupabaseOAuth).toHaveBeenCalledWith({
      provider: 'github',
      supabaseBaseUrl: undefined,
      callbackMode: 'desktop',
    });
  });

  it('delegates auth-origin resolution instead of passing the active hosted runtime URL', async () => {
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'https://runtime.example.test',
      computeTarget: 'kenkui-cloud',
    });
    renderSettings();

    expect(await screen.findByRole('heading', { name: /cloud account/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));

    expect(beginSupabaseOAuth).toHaveBeenCalledWith({
      provider: 'github',
      supabaseBaseUrl: undefined,
      callbackMode: 'desktop',
    });
  });

  it('shows local hosted auth errors from settings without opening browser fallback', async () => {
    mockBeginSupabaseOAuth.mockRejectedValue(
      new Error('Local Kengui Cloud sign in requires the Tauri app. Launch with `rtk npm run tauri -- dev` and try again.')
    );
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'http://127.0.0.1:54321',
      computeTarget: 'kenkui-cloud',
    });
    renderSettings();

    expect(await screen.findByRole('heading', { name: /cloud account/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));

    expect(await screen.findByText(/local kengui cloud sign in requires the tauri app/i)).toBeInTheDocument();
  });

  it('unsubscribes the cloud account auth callback listener on unmount', async () => {
    const unlisten = vi.fn();
    mockOnAuthCallback.mockResolvedValue(unlisten);
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });

    const { unmount } = renderSettings();
    await screen.findByRole('heading', { name: /cloud account/i });
    await vi.waitFor(() => expect(mockOnAuthCallback).toHaveBeenCalled());
    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('ignores cloud auth callbacks that arrive after unmount', async () => {
    const callbacks: Array<(url: string) => void> = [];
    mockOnAuthCallback.mockImplementation((handler) => {
      callbacks.push(handler);
      return Promise.resolve(() => {});
    });
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });

    const { unmount } = renderSettings();
    await screen.findByRole('heading', { name: /cloud account/i });
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    unmount();
    const staleCallback = callbacks[0];
    if (!staleCallback) throw new Error('Expected auth callback to be registered.');
    staleCallback('http://127.0.0.1:49152/auth/callback?code=stale-code');

    expect(exchangeSupabaseCode).not.toHaveBeenCalled();
  });

  it('shows signed in cloud account state and supports sign out', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    mockLoadAuthSessionSummary.mockResolvedValue({
      email: 'reader@example.com',
      provider: 'github',
      expiresAt: 123,
    });
    renderSettings();

    expect(await screen.findByText('reader@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(clearAuthSession).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('shows runtime diagnostics and full logs', async () => {
    renderSettings();

    expect(await screen.findByText('healthy')).toBeInTheDocument();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Running (123)')).toBeInTheDocument();
    expect(screen.getByText(/ERROR: failed callback/)).toBeInTheDocument();
    expect(
      screen.getByText(/kengui starts one local kenkui runtime/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Workers').length).toBeGreaterThan(0);
    expect(screen.getByText('4')).toBeInTheDocument();
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

  it('copies diagnostics logs for attached local runtimes', async () => {
    runtime.status.mockResolvedValue({
      available: true,
      running: false,
      pid: null,
      last_error: null,
      port_owner: 'kenkui pid 999 is listening on port 45365',
      log_tail: ['INFO: file backed log'],
    });
    runtime.logs.mockResolvedValue(['INFO: file backed log']);

    renderSettings();
    await screen.findByText(/Attached to existing local runtime/);

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('INFO: file backed log');
  });

  it('falls back to status log tail when the native log command fails', async () => {
    runtime.logs.mockRejectedValue(new Error('server_logs failed'));

    renderSettings();

    expect(await screen.findByText(/INFO: fallback status log/)).toBeInTheDocument();
    expect(screen.getByText(/Runtime log command failed: server_logs failed/)).toBeInTheDocument();
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
    await vi.waitFor(() => expect(useConnectionStore.getState().serverMode).toBe('external'));
  });

  it('edits and saves structured config fields', async () => {
    renderSettings();

    await screen.findByText('Alba (female, en-us)');

    const defaultVoiceSelect = screen.getByRole('combobox', { name: /default voice/i });
    expect(defaultVoiceSelect).toHaveValue('alba');
    await userEvent.selectOptions(defaultVoiceSelect, 'clara');

    const bitrateSelect = screen.getByRole('combobox', { name: /m4b bitrate/i });
    expect(bitrateSelect).toHaveValue('96k');
    await userEvent.click(screen.getByRole('button', { name: /save config/i }));

    expect(patchConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        default_voice: 'clara',
        workers: 4,
        pause_line_ms: 800,
      })
    );
  });

  it('allows manual model entry when provider model discovery is unavailable', async () => {
    mockSupportsProviderModels.mockReturnValue(false);
    mockUseProviderModels.mockReturnValue({
      models: [],
      loading: false,
      error: 'This kenkui runtime does not support provider model discovery. Upgrade kenkui and try again.',
    });
    renderSettings();

    const modelInput = await screen.findByRole('textbox', { name: /nlp model/i });
    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, 'llama3.2:latest');
    await userEvent.click(screen.getByRole('button', { name: /save config/i }));

    expect(patchConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        nlp_model: 'llama3.2:latest',
      })
    );
  });

  it('renders sections in order: Server, Cloud Account, Runtime, Config, Credentials', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    renderSettings();

    // Wait for async sections to mount
    await screen.findByRole('heading', { name: /cloud account/i });

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());

    const serverIdx = headings.findIndex((t) => t === 'Server');
    const cloudIdx = headings.findIndex((t) => /cloud account/i.test(t ?? ''));
    const runtimeIdx = headings.findIndex((t) => t === 'Runtime');
    const configIdx = headings.findIndex((t) => /^Config$/i.test(t ?? ''));
    const credIdx = headings.findIndex((t) => /credentials/i.test(t ?? ''));

    expect(serverIdx).toBeGreaterThanOrEqual(0);
    expect(cloudIdx).toBeGreaterThan(serverIdx);
    expect(runtimeIdx).toBeGreaterThan(cloudIdx);
    expect(configIdx).toBeGreaterThan(runtimeIdx);
    expect(credIdx).toBeGreaterThan(configIdx);
  });

  it('shows masked credentials and saves plus tests provider credentials', async () => {
    renderSettings();

    expect(await screen.findByRole('heading', { name: /^OpenAI$/i })).toBeInTheDocument();
    expect(screen.getByText(/configured sk-t...1234/i)).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^provider$/i }),
      'openai'
    );
    await userEvent.type(
      screen.getByPlaceholderText(/leave blank to keep existing key/i),
      'sk-new-5678'
    );
    await userEvent.click(screen.getByRole('combobox', { name: /default model/i }));
    await userEvent.click(screen.getByRole('option', { name: 'gpt-4.1-mini' }));
    await userEvent.click(screen.getByRole('button', { name: /save and test/i }));

    expect(updateProviderCredentials).toHaveBeenCalledWith('openai', {
      api_key: 'sk-new-5678',
      default_model: 'gpt-4.1-mini',
    });
    expect(testProviderCredentials).toHaveBeenCalledWith('openai');
  });
});
