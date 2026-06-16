import { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Server } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';
import { createRuntimeAdapter, type LocalRuntimeStatus, type RuntimeHealth } from '../runtime/runtime';

export default function Settings() {
  const { serverMode, serverUrl, setServerMode } = useConnectionStore();
  const [localMode, setLocalMode] = useState<ServerMode>(serverMode);
  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [status, setStatus] = useState<LocalRuntimeStatus | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  async function refreshDiagnostics() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    setDiagnosticError(null);
    try {
      const [nextHealth, nextStatus] = await Promise.all([
        runtime.health(),
        runtime.status(),
      ]);
      setHealth(nextHealth);
      setStatus(nextStatus);
    } catch (error) {
      setHealth(null);
      if (serverMode === 'local') {
        try {
          setStatus(await runtime.status());
        } catch {
          setStatus(null);
        }
      }
      setDiagnosticError(error instanceof Error ? error.message : 'Runtime check failed.');
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
            <Button variant="outline" size="sm" onClick={refreshDiagnostics}>
              <RefreshCw aria-hidden="true" />
              Refresh
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
              {status && (
                <>
                  <dt className="text-muted-foreground">Process</dt>
                  <dd>{status.running ? `Running (${status.pid ?? 'unknown pid'})` : 'Stopped'}</dd>
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd>{status.available ? 'Available' : 'Missing'}</dd>
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

              {status && status.log_tail.length > 0 && (
                <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs">
                  {status.log_tail.slice(-20).join('\n')}
                </pre>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
