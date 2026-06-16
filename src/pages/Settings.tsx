import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, RefreshCw, RotateCcw, Server } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';
import { createRuntimeAdapter, type LocalRuntimeStatus, type RuntimeHealth } from '../runtime/runtime';

type LogOrder = 'newest' | 'oldest';

function lineMatchesSeverity(line: string, filter: string): boolean {
  if (filter === 'all') return true;
  return line.toLowerCase().includes(filter);
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

  async function handleSave() {
    await setServerMode(localMode, localUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
                  {status.last_error && (
                    <>
                      <dt className="text-muted-foreground">Last error</dt>
                      <dd className="break-words">{status.last_error}</dd>
                    </>
                  )}
                </>
              )}
            </dl>

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
      </div>
    </Layout>
  );
}
