import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, RotateCcw, Save, Server, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';
import { createRuntimeAdapter, type LocalRuntimeStatus, type RuntimeHealth } from '../runtime/runtime';
import { formatRequestedLocalChapterThreads, getRequestedLocalChapterThreads } from '../runtime/threadBudget';
import { fetchConfig, patchConfig, type KenkuiConfig } from '../api/config';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
  updateProviderCredentials,
  type ProviderCredentialStatus,
} from '../api/credentials';

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

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
  openrouter: 'OpenRouter',
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

function credentialDraftsFromStatuses(statuses: ProviderCredentialStatus[]) {
  return statuses.reduce<Record<string, CredentialDraft>>((drafts, status) => {
    drafts[status.provider] = {
      apiKey: '',
      defaultModel: status.default_model,
    };
    return drafts;
  }, {});
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
  const [credentials, setCredentials] = useState<ProviderCredentialStatus[]>([]);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, CredentialDraft>>({});
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const requestedChapterThreads = getRequestedLocalChapterThreads();

  const visibleLogs = useMemo(() => {
    const filtered = logs.filter((line) => lineMatchesSeverity(line, logFilter));
    return logOrder === 'newest' ? [...filtered].reverse() : filtered;
  }, [logFilter, logOrder, logs]);

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

  async function saveConfig() {
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
      setCredentialDrafts(credentialDraftsFromStatuses(response.providers));
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Credential load failed.');
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
    setCredentialSaving(provider);
    setCredentialError(null);
    setCredentialMessage(null);
    try {
      const request = {
        default_model: draft.defaultModel.trim(),
      } as { api_key?: string | null; default_model?: string | null };
      if (draft.apiKey.trim()) {
        request.api_key = draft.apiKey.trim();
      }
      const updated = await updateProviderCredentials(provider, request);
      setCredentials((current) =>
        current.map((item) => (item.provider === provider ? updated : item))
      );
      updateCredentialDraft(provider, { apiKey: '', defaultModel: updated.default_model });
      setCredentialMessage(`${PROVIDER_LABELS[provider] ?? provider} saved.`);
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
      await refreshCredentials();
      setCredentialMessage(`${PROVIDER_LABELS[provider] ?? provider} removed.`);
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
                  <dd>{status.running ? `Running (${status.pid ?? 'unknown pid'})` : 'Stopped'}</dd>
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>{status.available ? 'Available' : 'Missing'}</dd>
                  <dt className="text-muted-foreground">Chapter threads</dt>
                  <dd>
                    {serverMode === 'local'
                      ? `Requested ${formatRequestedLocalChapterThreads(requestedChapterThreads)}`
                      : 'Not requested'}
                  </dd>
                  {status.last_error && (
                    <>
                      <dt className="text-muted-foreground">Last error</dt>
                      <dd className="break-words">{status.last_error}</dd>
                    </>
                  )}
                </>
              )}
            </dl>

            {serverMode === 'local' && (
              <p className="mt-3 text-xs text-muted-foreground">
                Local runs request all available CPU threads, so multiple chapters can run in parallel.
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
                disabled={restarting}
              >
                <RotateCcw aria-hidden="true" />
                {restarting ? 'Restarting...' : 'Restart local server'}
              </Button>

              <div className="rounded-md border bg-background/45">
                <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium">Local server logs</h3>
                    <p className="text-xs text-muted-foreground">
                      {logs.length} retained line{logs.length === 1 ? '' : 's'}
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
                      disabled={visibleLogs.length === 0}
                    >
                      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                {visibleLogs.length > 0 ? (
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
              <Button size="sm" onClick={saveConfig} disabled={configSaving || configLoading}>
                <Save aria-hidden="true" />
                {configSaving ? 'Saving...' : 'Save config'}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Default voice</span>
              <input
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.default_voice}
                onChange={(event) => updateConfigField('default_voice', event.target.value)}
              />
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
              <input
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.m4b_bitrate}
                onChange={(event) => updateConfigField('m4b_bitrate', event.target.value)}
              />
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
                onChange={(event) => updateConfigField('nlp_provider', event.target.value)}
              >
                <option value="ollama">Ollama</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">NLP model</span>
              <input
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                value={configForm.nlp_model}
                onChange={(event) => updateConfigField('nlp_model', event.target.value)}
              />
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

          <div className="flex flex-col gap-3">
            {credentials.map((credential) => {
              const draft = credentialDrafts[credential.provider] ?? {
                apiKey: '',
                defaultModel: credential.default_model,
              };
              const label = PROVIDER_LABELS[credential.provider] ?? credential.provider;
              const saving = credentialSaving === credential.provider;

              return (
                <div key={credential.provider} className="rounded-md border bg-background/45 p-3">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-medium">{label}</h3>
                      <p className="text-xs text-muted-foreground">
                        {credential.configured
                          ? `Configured ${credential.masked_key_hint}`
                          : 'Not configured'}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteCredential(credential.provider)}
                      disabled={saving}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">API key</span>
                      <input
                        type="password"
                        autoComplete="off"
                        className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                        placeholder={credential.configured ? 'Preserve existing key' : 'Enter key'}
                        value={draft.apiKey}
                        onChange={(event) =>
                          updateCredentialDraft(credential.provider, { apiKey: event.target.value })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">Default model</span>
                      <input
                        className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                        value={draft.defaultModel}
                        onChange={(event) =>
                          updateCredentialDraft(credential.provider, {
                            defaultModel: event.target.value,
                          })
                        }
                      />
                    </label>
                    <Button
                      className="md:mb-0"
                      onClick={() => saveCredential(credential.provider)}
                      disabled={saving}
                    >
                      <Save aria-hidden="true" />
                      {saving ? 'Saving...' : 'Update'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

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
