import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, RotateCcw, Save, Server, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { ModelCombobox } from '../components/ModelCombobox';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';
import {
  createRuntimeAdapter,
  supportsProviderCredentials,
  supportsProviderModels,
  type LocalRuntimeStatus,
  type RuntimeHealth,
} from '../runtime/runtime';
import { formatRequestedLocalChapterThreads, getRequestedLocalChapterThreads } from '../runtime/threadBudget';
import { fetchConfig, patchConfig, type KenkuiConfig } from '../api/config';
import { fetchVoices, type VoiceResponse } from '../api/voices';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
  isProviderCredentialsUnsupportedError,
  testProviderCredentials,
  updateProviderCredentials,
  type ProviderCredentialStatus,
} from '../api/credentials';
import { CREDENTIAL_PROVIDER_OPTIONS, M4B_BITRATE_OPTIONS, NLP_PROVIDER_OPTIONS, providerLabel } from '../lib/providerCatalog';
import { withCurrentOption } from '../lib/selectOptions';
import { useProviderModels } from '../hooks/useProviderModels';

type LogOrder = 'newest' | 'oldest';
type ConfigForm = {
  default_voice: string;
  default_output_dir: string;
  workers: string;
  m4b_bitrate: string;
  pause_line_ms: string;
  pause_chapter_ms: string;
  nlp_provider: string;
  nlp_model: string;
  ollama_url: string;
  nlp_discovery_method: string;
};

type CredentialDraft = {
  apiKey: string;
  defaultModel: string;
};

const EMPTY_CONFIG_FORM: ConfigForm = {
  default_voice: '',
  default_output_dir: '',
  workers: '',
  m4b_bitrate: '',
  pause_line_ms: '',
  pause_chapter_ms: '',
  nlp_provider: '',
  nlp_model: '',
  ollama_url: '',
  nlp_discovery_method: '',
};

const HOSTED_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_HOSTED === 'true';

function lineMatchesSeverity(line: string, filter: string): boolean {
  if (filter === 'all') return true;
  return line.toLowerCase().includes(filter);
}

function configString(config: KenkuiConfig, key: keyof ConfigForm): string {
  const value = config[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function hydrateConfigForm(config: KenkuiConfig): ConfigForm {
  return {
    default_voice: configString(config, 'default_voice'),
    default_output_dir: configString(config, 'default_output_dir'),
    workers: configString(config, 'workers'),
    m4b_bitrate: configString(config, 'm4b_bitrate'),
    pause_line_ms: configString(config, 'pause_line_ms'),
    pause_chapter_ms: configString(config, 'pause_chapter_ms'),
    nlp_provider: configString(config, 'nlp_provider'),
    nlp_model: configString(config, 'nlp_model'),
    ollama_url: configString(config, 'ollama_url'),
    nlp_discovery_method: configString(config, 'nlp_discovery_method'),
  };
}

function parseBoundedInt(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return parsed;
}

function configPatchFromForm(form: ConfigForm): KenkuiConfig {
  return {
    default_voice: form.default_voice.trim(),
    default_output_dir: form.default_output_dir.trim() || null,
    workers: parseBoundedInt(form.workers, 'Workers', 1, 128),
    m4b_bitrate: form.m4b_bitrate.trim(),
    pause_line_ms: parseBoundedInt(form.pause_line_ms, 'Line pause', 0, 30000),
    pause_chapter_ms: parseBoundedInt(form.pause_chapter_ms, 'Chapter pause', 0, 120000),
    nlp_provider: form.nlp_provider.trim(),
    nlp_model: form.nlp_model.trim(),
    ollama_url: form.ollama_url.trim(),
    nlp_discovery_method: form.nlp_discovery_method.trim() || 'auto',
  };
}

export default function Settings() {
  const { serverMode, serverUrl, setServerMode } = useConnectionStore();
  const [localMode, setLocalMode] = useState<ServerMode>(serverMode);
  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [status, setStatus] = useState<LocalRuntimeStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [logOrder, setLogOrder] = useState<LogOrder>('newest');
  const [logFilter, setLogFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [configForm, setConfigForm] = useState<ConfigForm>(EMPTY_CONFIG_FORM);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceResponse[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<ProviderCredentialStatus[]>([]);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, CredentialDraft>>({});
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [selectedCredentialProvider, setSelectedCredentialProvider] = useState<string>(
    CREDENTIAL_PROVIDER_OPTIONS[0].value
  );
  const requestedChapterThreads = getRequestedLocalChapterThreads();
  const {
    models: configModelOptions,
    loading: configModelsLoading,
    error: configModelsError,
  } = useProviderModels(configForm.nlp_provider);
  const {
    models: credentialModelOptions,
    loading: credentialModelsLoading,
    error: credentialModelsError,
  } = useProviderModels(selectedCredentialProvider);

  const visibleLogs = useMemo(() => {
    const filtered = logs.filter((line) => lineMatchesSeverity(line, logFilter));
    return logOrder === 'newest' ? [...filtered].reverse() : filtered;
  }, [logFilter, logOrder, logs]);
  const availableVoices = useMemo(() => voices.filter((voice) => !voice.excluded), [voices]);
  const selectedCredentialStatus = useMemo(
    () =>
      credentials.find((item) => item.provider === selectedCredentialProvider) ?? {
        provider: selectedCredentialProvider,
        configured: false,
        default_model: '',
        masked_key_hint: '',
      },
    [credentials, selectedCredentialProvider]
  );
  const selectedCredentialDraft =
    credentialDrafts[selectedCredentialProvider] ?? {
      apiKey: '',
      defaultModel: selectedCredentialStatus.default_model,
    };
  const localRuntimeManagement =
    serverMode === 'local' && health ? (status?.running ? 'managed' : 'attached') : null;
  const providerModelsSupported = supportsProviderModels(health);
  const providerCredentialsSupported = supportsProviderCredentials(health);
  const providerModelsUnavailable =
    Boolean(health && !providerModelsSupported) ||
    Boolean(configModelsError?.includes('does not support provider model discovery'));

  async function refreshDiagnostics() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    setRefreshing(true);
    setDiagnosticError(null);
    try {
      const [nextHealth, nextStatus, nextLogs] = await Promise.all([
        runtime.health(),
        runtime.status(),
        serverMode === 'local' ? runtime.logs() : Promise.resolve([]),
      ]);
      setHealth(nextHealth);
      setStatus(nextStatus);
      setLogs(nextLogs);
    } catch (error) {
      setHealth(null);
      if (serverMode === 'local') {
        try {
          const [nextStatus, nextLogs] = await Promise.all([
            runtime.status(),
            runtime.logs(),
          ]);
          setStatus(nextStatus);
          setLogs(nextLogs);
        } catch {
          setStatus(null);
          setLogs([]);
        }
      }
      setDiagnosticError(error instanceof Error ? error.message : 'Runtime check failed.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refreshDiagnostics();
  }, [serverMode, serverUrl]);

  useEffect(() => {
    refreshConfig();
    refreshCredentials();
    refreshVoices();
  }, [serverMode, serverUrl]);

  async function handleSave() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);

    try {
      if (serverMode === 'local' && localMode !== 'local') {
        await runtime.stop();
      }
      await setServerMode(localMode, localUrl);
      setDiagnosticError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : 'Saving settings failed.');
    }
  }

  async function handleRestart() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    setRestarting(true);
    setDiagnosticError(null);
    try {
      await runtime.restart();
      await refreshDiagnostics();
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : 'Restart failed.');
    } finally {
      setRestarting(false);
    }
  }

  async function handleCopyLogs() {
    if (visibleLogs.length === 0) return;
    await navigator.clipboard.writeText(visibleLogs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function refreshConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetchConfig();
      setConfigForm(hydrateConfigForm(response.config));
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Config load failed.');
    } finally {
      setConfigLoading(false);
    }
  }

  async function refreshVoices() {
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      const response = await fetchVoices();
      setVoices(response.voices);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Voice load failed.');
    } finally {
      setVoiceLoading(false);
    }
  }

  async function saveConfig() {
    if (!configForm.nlp_model.trim()) {
      setConfigError('Select an NLP model.');
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    setConfigMessage(null);
    try {
      const response = await patchConfig(configPatchFromForm(configForm));
      setConfigForm(hydrateConfigForm(response.config));
      setConfigMessage('Config saved.');
      setTimeout(() => setConfigMessage(null), 1800);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Config save failed.');
    } finally {
      setConfigSaving(false);
    }
  }

  async function refreshCredentials() {
    setCredentialLoading(true);
    setCredentialError(null);
    try {
      const response = await fetchProviderCredentials();
      setCredentials(response.providers);
      setCredentialDrafts((current) => {
        const nextDrafts = { ...current };
        const statusesByProvider = new Map(
          response.providers.map((status) => [status.provider, status] as const)
        );

        for (const provider of CREDENTIAL_PROVIDER_OPTIONS) {
          const status = statusesByProvider.get(provider.value);
          if (status) {
            nextDrafts[provider.value] = {
              apiKey: '',
              defaultModel:
                nextDrafts[provider.value]?.defaultModel.trim() || status.default_model,
            };
            continue;
          }
          if (!nextDrafts[provider.value]) {
            nextDrafts[provider.value] = { apiKey: '', defaultModel: '' };
          }
        }

        return nextDrafts;
      });
    } catch (error) {
      setCredentials([]);
      if (isProviderCredentialsUnsupportedError(error)) {
        setCredentialError(error.message);
      } else {
        setCredentialError(error instanceof Error ? error.message : 'Credential load failed.');
      }
    } finally {
      setCredentialLoading(false);
    }
  }

  function updateConfigField(field: keyof ConfigForm, value: string) {
    setConfigForm((current) => ({ ...current, [field]: value }));
  }

  function updateCredentialDraft(provider: string, patch: Partial<CredentialDraft>) {
    setCredentialDrafts((current) => ({
      ...current,
      [provider]: {
        apiKey: '',
        defaultModel: '',
        ...current[provider],
        ...patch,
      },
    }));
  }

  async function saveCredential(provider: string) {
    const draft = credentialDrafts[provider] ?? { apiKey: '', defaultModel: '' };
    const currentStatus = credentials.find((item) => item.provider === provider);
    const needsKey = !currentStatus?.configured && !draft.apiKey.trim();
    const resolvedDefaultModel = draft.defaultModel.trim() || currentStatus?.default_model || '';

    if (needsKey) {
      setCredentialError('API key is required to add this provider.');
      return;
    }
    if (!resolvedDefaultModel) {
      setCredentialError('Select a default model.');
      return;
    }

    setCredentialSaving(provider);
    setCredentialError(null);
    setCredentialMessage(null);
    try {
      const request = {
        default_model: resolvedDefaultModel,
      } as { api_key?: string | null; default_model?: string | null };
      if (draft.apiKey.trim()) {
        request.api_key = draft.apiKey.trim();
      }
      const updated = await updateProviderCredentials(provider, request);
      setCredentials((current) => {
        const exists = current.some((item) => item.provider === provider);
        if (!exists) {
          return [...current, updated];
        }
        return current.map((item) => (item.provider === provider ? updated : item));
      });
      updateCredentialDraft(provider, {
        apiKey: '',
        defaultModel: updated.default_model,
      });
      setCredentialMessage(`${providerLabel(provider)} saved.`);

      try {
        await testProviderCredentials(provider);
        setCredentialMessage(`${providerLabel(provider)} saved and validated.`);
      } catch (error) {
        setCredentialError(
          error instanceof Error
            ? `${providerLabel(provider)} saved, but validation failed: ${error.message}`
            : `${providerLabel(provider)} saved, but validation failed.`
        );
      }

      setTimeout(() => setCredentialMessage(null), 1800);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Credential save failed.');
    } finally {
      setCredentialSaving(null);
    }
  }

  async function deleteCredential(provider: string) {
    setCredentialSaving(provider);
    setCredentialError(null);
    setCredentialMessage(null);
    try {
      await deleteProviderCredentials(provider);
      setCredentialDrafts((current) => ({
        ...current,
        [provider]: { apiKey: '', defaultModel: '' },
      }));
      await refreshCredentials();
      setCredentialMessage(`${providerLabel(provider)} removed.`);
      setTimeout(() => setCredentialMessage(null), 1800);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Credential delete failed.');
    } finally {
      setCredentialSaving(null);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl flex flex-col gap-8">
        <div>
          <p className="text-sm font-medium text-primary">Settings</p>
          <h1 className="text-3xl font-semibold">Runtime Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose where conversions run and inspect the current kenkui connection.
          </p>
        </div>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
              <Server className="size-5" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-semibold">Server</h2>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/45 p-3">
              <input
                type="radio"
                name="serverMode"
                value="local"
                aria-label="Local (managed)"
                checked={localMode === 'local'}
                onChange={() => setLocalMode('local')}
              />
              <div>
                <p className="font-medium text-sm">Local (managed)</p>
                <p className="text-xs text-muted-foreground">
                  kengui starts and manages kenkui automatically.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/45 p-3">
              <input
                type="radio"
                name="serverMode"
                value="external"
                aria-label="External server"
                checked={localMode === 'external'}
                onChange={() => setLocalMode('external')}
              />
              <div>
                <p className="font-medium text-sm">External server</p>
                <p className="text-xs text-muted-foreground">
                  Connect to a remote or manually-started kenkui runtime.
                </p>
              </div>
            </label>

            {HOSTED_RUNTIME_ENABLED && (
              <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/45 p-3">
                <input
                  type="radio"
                  name="serverMode"
                  value="hosted"
                  aria-label="Kengui Cloud"
                  checked={localMode === 'hosted'}
                  onChange={() => setLocalMode('hosted')}
                />
                <div>
                  <p className="font-medium text-sm">Kengui Cloud</p>
                  <p className="text-xs text-muted-foreground">
                    Connect to the hosted compute service for paid store builds.
                  </p>
                </div>
              </label>
            )}
          </div>

          {localMode !== 'local' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="server-url">
                Server URL
              </label>
              <input
                id="server-url"
                type="url"
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
                placeholder={
                  localMode === 'hosted'
                    ? 'https://api.kengui.app'
                    : 'http://my-server.local:45365'
                }
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
              />
            </div>
          )}

          <Button className="w-fit" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save settings'}
          </Button>

          {localMode !== serverMode && (
            <p className="text-xs text-muted-foreground">
              Changes take effect after restarting kengui.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">Runtime</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshDiagnostics}
              disabled={refreshing}
            >
              <RefreshCw aria-hidden="true" />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <div className="rounded-md border bg-background/45 p-4 text-sm">
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Mode</dt>
              <dd>{serverMode}</dd>
              <dt className="text-muted-foreground">Server URL</dt>
              <dd className="break-all">{serverUrl}</dd>
              <dt className="text-muted-foreground">Health</dt>
              <dd>{health?.status ?? 'Unavailable'}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{health?.server_version ?? health?.version ?? 'Unknown'}</dd>
              {health?.api_version && (
                <>
                  <dt className="text-muted-foreground">API</dt>
                  <dd>{health.api_version}</dd>
                </>
              )}
              {status && (
                <>
                  <dt className="text-muted-foreground">Process</dt>
                  <dd>
                    {localRuntimeManagement === 'attached'
                      ? 'Attached to existing local runtime'
                      : status.running
                        ? `Running (${status.pid ?? 'unknown pid'})`
                        : 'Stopped'}
                  </dd>
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>
                    {localRuntimeManagement === 'attached'
                      ? 'Externally managed'
                      : status.available
                        ? 'Available'
                        : 'Missing'}
                  </dd>
                  <dt className="text-muted-foreground">Chapter threads</dt>
                  <dd>
                    {localRuntimeManagement === 'managed'
                      ? `Requested ${formatRequestedLocalChapterThreads(requestedChapterThreads)}`
                      : localRuntimeManagement === 'attached'
                        ? 'Not adjusted for attached runtimes'
                        : 'Not requested'}
                  </dd>
                  {status.last_error && (
                    <>
                      <dt className="text-muted-foreground">Last error</dt>
                      <dd className="break-words">{status.last_error}</dd>
                    </>
                  )}
                  {status.port_owner && (
                    <>
                      <dt className="text-muted-foreground">Port 45365</dt>
                      <dd className="break-words">{status.port_owner}</dd>
                    </>
                  )}
                </>
              )}
            </dl>

            {serverMode === 'local' && (
              <p className="mt-3 text-xs text-muted-foreground">
                {localRuntimeManagement === 'attached'
                  ? 'This local runtime was started outside kengui. Stop and restart it from its own terminal if you need to change process settings.'
                  : 'Local runs started by kengui request all available CPU threads, so multiple chapters can run in parallel.'}
              </p>
            )}

            {diagnosticError && (
              <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {diagnosticError}
              </p>
            )}
          </div>

          {serverMode === 'local' && (
            <>
              <Button
                variant="outline"
                className="w-fit"
                onClick={handleRestart}
                disabled={restarting || localRuntimeManagement === 'attached'}
              >
                <RotateCcw aria-hidden="true" />
                {restarting ? 'Restarting...' : 'Restart local server'}
              </Button>

              <div className="rounded-md border bg-background/45">
                <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium">Local server logs</h3>
                    <p className="text-xs text-muted-foreground">
                      {localRuntimeManagement === 'attached'
                        ? 'Logs are only available for local runtimes started by kengui.'
                        : `${logs.length} retained line${logs.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Log severity"
                      className="h-8 rounded-md border bg-card px-2 text-sm"
                      value={logFilter}
                      onChange={(event) => setLogFilter(event.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="error">Errors</option>
                      <option value="warning">Warnings</option>
                      <option value="info">Info</option>
                    </select>
                    <select
                      aria-label="Log order"
                      className="h-8 rounded-md border bg-card px-2 text-sm"
                      value={logOrder}
                      onChange={(event) => setLogOrder(event.target.value as LogOrder)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLogs}
                      disabled={visibleLogs.length === 0 || localRuntimeManagement === 'attached'}
                    >
                      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                {localRuntimeManagement === 'attached' ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    This process is externally managed. Use the terminal that launched `kenkui serve` for logs and restarts.
                  </p>
                ) : visibleLogs.length > 0 ? (
                  <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-5">
                    {visibleLogs.join('\n')}
                  </pre>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No log lines match the current diagnostics view.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
                <SlidersHorizontal className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold">Config</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refreshConfig} disabled={configLoading}>
                <RefreshCw aria-hidden="true" />
                {configLoading ? 'Loading...' : 'Reload'}
              </Button>
              <Button
                size="sm"
                onClick={saveConfig}
                disabled={configSaving || configLoading || configModelsLoading || !configForm.nlp_model.trim()}
              >
                <Save aria-hidden="true" />
                {configSaving ? 'Saving...' : 'Save config'}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Default voice</span>
              {voiceLoading && <p className="text-xs text-muted-foreground">Loading voices...</p>}
              {!voiceLoading && voiceError && (
                <p className="text-xs text-destructive">{voiceError}</p>
              )}
              <select
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.default_voice}
                onChange={(event) => updateConfigField('default_voice', event.target.value)}
                disabled={voiceLoading}
              >
                <option value="">Select a voice</option>
                {configForm.default_voice.trim() &&
                  !availableVoices.some((voice) => voice.name === configForm.default_voice) && (
                    <option value={configForm.default_voice}>
                      Current: {configForm.default_voice}
                    </option>
                  )}
                {availableVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.display_label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Default output dir</span>
              <input
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.default_output_dir}
                onChange={(event) => updateConfigField('default_output_dir', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Workers</span>
              <input
                type="number"
                min={1}
                max={128}
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.workers}
                onChange={(event) => updateConfigField('workers', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">M4B bitrate</span>
              <select
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.m4b_bitrate}
                onChange={(event) => updateConfigField('m4b_bitrate', event.target.value)}
              >
                <option value="">Select bitrate</option>
                {withCurrentOption(configForm.m4b_bitrate, M4B_BITRATE_OPTIONS).map((bitrate) => (
                  <option key={bitrate} value={bitrate}>
                    {bitrate}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Line pause ms</span>
              <input
                type="number"
                min={0}
                max={30000}
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.pause_line_ms}
                onChange={(event) => updateConfigField('pause_line_ms', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Chapter pause ms</span>
              <input
                type="number"
                min={0}
                max={120000}
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.pause_chapter_ms}
                onChange={(event) => updateConfigField('pause_chapter_ms', event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">NLP provider</span>
              <select
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.nlp_provider}
                onChange={(event) => {
                  updateConfigField('nlp_provider', event.target.value);
                  updateConfigField('nlp_model', '');
                }}
              >
                {NLP_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">NLP model</span>
              {configModelsLoading && (
                <p className="text-xs text-muted-foreground">Loading models...</p>
              )}
              {!configModelsLoading && configModelsError && (
                <p className="text-xs text-destructive">{configModelsError}</p>
              )}
              {!configModelsLoading && providerModelsUnavailable && (
                <p className="text-xs text-muted-foreground">
                  Model discovery is unavailable for this runtime. Enter the model id manually.
                </p>
              )}
              {providerModelsUnavailable ? (
                <input
                  className="box-border min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2"
                  value={configForm.nlp_model}
                  onChange={(event) => updateConfigField('nlp_model', event.target.value)}
                  placeholder="llama3.2"
                />
              ) : (
                <ModelCombobox
                  id="config-nlp-model"
                  value={configForm.nlp_model}
                  onChange={(value) => updateConfigField('nlp_model', value)}
                  options={configModelOptions}
                  placeholder="Search models"
                  disabled={configModelsLoading}
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="font-medium">Ollama URL</span>
              <input
                type="url"
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.ollama_url}
                onChange={(event) => updateConfigField('ollama_url', event.target.value)}
              />
            </label>
          </div>

          {configMessage && (
            <p className="rounded-md border border-[var(--color-success)]/25 bg-[rgb(111_138_101_/_12%)] px-3 py-2 text-sm text-[var(--color-success)]">
              {configMessage}
            </p>
          )}
          {configError && (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {configError}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
                <KeyRound className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-semibold">Provider Credentials</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshCredentials}
              disabled={credentialLoading}
            >
              <RefreshCw aria-hidden="true" />
              {credentialLoading ? 'Loading...' : 'Reload'}
            </Button>
          </div>

          {!providerCredentialsSupported && health ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This runtime does not support provider credentials management. Upgrade kenkui to edit or validate credentials here.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col gap-2">
              {CREDENTIAL_PROVIDER_OPTIONS.map((provider) => {
                const credential = credentials.find((item) => item.provider === provider.value) ?? {
                  provider: provider.value,
                  configured: false,
                  default_model: '',
                  masked_key_hint: '',
                };
                const active = selectedCredentialProvider === provider.value;

                return (
                  <div
                    key={provider.value}
                    className={`flex items-start justify-between gap-3 rounded-md border px-3 py-3 ${
                      active ? 'border-primary/50 bg-primary/5' : 'bg-background/45'
                    }`}
                  >
                    <div className="min-w-0">
                      <h3 className="font-medium">{provider.label}</h3>
                      <p className="text-xs text-muted-foreground">
                        {credential.configured
                          ? `Configured ${credential.masked_key_hint}`
                          : 'Not configured'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {credential.default_model
                          ? `Default model ${credential.default_model}`
                          : 'No default model'}
                      </p>
                    </div>
                    <Button
                      variant={active ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedCredentialProvider(provider.value);
                        setCredentialError(null);
                        setCredentialMessage(null);
                      }}
                    >
                      {active ? 'Selected' : 'Edit'}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border bg-background/45 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-medium">{providerLabel(selectedCredentialProvider)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedCredentialStatus.configured
                      ? `Configured ${selectedCredentialStatus.masked_key_hint}`
                      : 'Not configured'}
                  </p>
                  {selectedCredentialStatus.default_model && (
                    <p className="text-xs text-muted-foreground">
                      Current model {selectedCredentialStatus.default_model}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => saveCredential(selectedCredentialProvider)}
                    disabled={
                      credentialSaving === selectedCredentialProvider ||
                      credentialLoading ||
                      credentialModelsLoading ||
                      !selectedCredentialDraft.defaultModel.trim() ||
                      (!selectedCredentialStatus.configured && !selectedCredentialDraft.apiKey.trim())
                    }
                  >
                    <Save aria-hidden="true" />
                    {credentialSaving === selectedCredentialProvider
                      ? 'Saving...'
                      : 'Save and test'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteCredential(selectedCredentialProvider)}
                    disabled={
                      credentialSaving === selectedCredentialProvider ||
                      credentialLoading ||
                      !selectedCredentialStatus.configured
                    }
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Provider</span>
                  <select
                    className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                    value={selectedCredentialProvider}
                    onChange={(event) => {
                      setSelectedCredentialProvider(event.target.value);
                      setCredentialError(null);
                      setCredentialMessage(null);
                    }}
                  >
                    {CREDENTIAL_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    className="box-border min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2"
                    placeholder={
                      selectedCredentialStatus.configured
                        ? 'Leave blank to keep existing key'
                        : 'Enter API key'
                    }
                    value={selectedCredentialDraft.apiKey}
                    onChange={(event) =>
                      updateCredentialDraft(selectedCredentialProvider, {
                        apiKey: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Default model</span>
                  {credentialModelsLoading && (
                    <p className="text-xs text-muted-foreground">Loading models...</p>
                  )}
                  {!credentialModelsLoading && credentialModelsError && (
                    <p className="text-xs text-destructive">{credentialModelsError}</p>
                  )}
                  <ModelCombobox
                    id="credential-default-model"
                    value={selectedCredentialDraft.defaultModel}
                    onChange={(value) =>
                      updateCredentialDraft(selectedCredentialProvider, {
                        defaultModel: value,
                      })
                    }
                    options={credentialModelOptions}
                    placeholder="Search models"
                    disabled={credentialModelsLoading}
                  />
                </label>
              </div>
            </div>
            </div>
          )}

          {credentialMessage && (
            <p className="rounded-md border border-[var(--color-success)]/25 bg-[rgb(111_138_101_/_12%)] px-3 py-2 text-sm text-[var(--color-success)]">
              {credentialMessage}
            </p>
          )}
          {credentialError && (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {credentialError}
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
}
