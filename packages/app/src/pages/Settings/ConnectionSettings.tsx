import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, RefreshCw, RotateCcw, Server } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { ComputeTarget, ServerMode } from '../../store/connection';
import { normalizeSupabaseBaseUrl } from '../../lib/cloudUrls';
import { createRuntimeAdapter } from '../../runtime/runtime';
import { useConnectionStore } from '../../store/connection';
import type { DiagnosticsController, LogOrder } from '../../hooks/useDiagnostics';
import {
  CLOUD_COMPUTE_ENABLED,
  HOSTED_RUNTIME_ENABLED,
  HOSTED_RUNTIME_URL,
  LOCAL_RUNTIME_ENABLED,
} from './constants';

interface Props {
  localMode: ServerMode;
  setLocalMode: (mode: ServerMode) => void;
  localUrl: string;
  setLocalUrl: (url: string) => void;
  localComputeTarget: ComputeTarget;
  setLocalComputeTarget: (target: ComputeTarget) => void;
  /** Config workers value shown in the runtime diagnostics table. */
  workers: string;
  diagnostics: DiagnosticsController;
  /** Optional slot rendered between the Server section and the Runtime section. */
  accountSlot?: ReactNode;
}

export function ConnectionSettings({
  localMode,
  setLocalMode,
  localUrl,
  setLocalUrl,
  localComputeTarget,
  setLocalComputeTarget,
  workers,
  diagnostics,
  accountSlot,
}: Props) {
  const { serverMode, serverUrl, computeTarget, setServerMode, setComputeTarget } = useConnectionStore();
  const {
    health,
    status,
    logs,
    visibleLogs,
    diagnosticError,
    setDiagnosticError,
    refreshing,
    restarting,
    logOrder,
    setLogOrder,
    logFilter,
    setLogFilter,
    copied,
    localRuntimeManagement,
    versionWarning,
    refreshDiagnostics,
    handleRestart,
    handleCopyLogs,
  } = diagnostics;

  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    const nextUrl = localMode === 'hosted' ? normalizeSupabaseBaseUrl(localUrl) : localUrl;
    const nextComputeTarget = localMode === 'hosted' ? 'kenkui-cloud' : localComputeTarget;

    try {
      if (serverMode === 'local' && localMode !== 'local') {
        await runtime.stop();
      }
      await setServerMode(localMode, nextUrl);
      await setComputeTarget(nextComputeTarget);
      setDiagnosticError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : 'Saving settings failed.');
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
            <Server className="size-4" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold">Server</h2>
        </div>

        <div className="flex flex-col gap-3">
          {LOCAL_RUNTIME_ENABLED && (
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
          )}

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
                onChange={() => {
                  setLocalMode('hosted');
                  setLocalUrl(serverMode === 'hosted' ? serverUrl : HOSTED_RUNTIME_URL);
                  setLocalComputeTarget('kenkui-cloud');
                }}
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

        <Link
          to="/connect"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open connection setup
        </Link>

        {CLOUD_COMPUTE_ENABLED && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <h3 className="font-medium">Compute target</h3>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/45 p-3">
              <input
                type="radio"
                name="computeTarget"
                value="local"
                aria-label="Local compute"
                checked={localComputeTarget === 'local'}
                onChange={() => setLocalComputeTarget('local')}
              />
              <div>
                <p className="font-medium text-sm">Local compute</p>
                <p className="text-xs text-muted-foreground">
                  Submit render jobs to the local kenkui queue.
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background/45 p-3">
              <input
                type="radio"
                name="computeTarget"
                value="kenkui-cloud"
                aria-label="Kengui Cloud compute"
                checked={localComputeTarget === 'kenkui-cloud'}
                onChange={() => setLocalComputeTarget('kenkui-cloud')}
              />
              <div>
                <p className="font-medium text-sm">Kengui Cloud compute</p>
                <p className="text-xs text-muted-foreground">
                  Keep local preview and logs, then submit render jobs through Supabase and R2.
                </p>
              </div>
            </label>
          </div>
        )}

        {localMode !== serverMode && (
          <p className="text-xs text-muted-foreground">
            Changes take effect after restarting kengui.
          </p>
        )}
      </section>

      {accountSlot}

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Runtime</h2>
          <Button variant="outline" size="sm" onClick={refreshDiagnostics} disabled={refreshing}>
            <RefreshCw aria-hidden="true" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <div className="rounded-md border bg-background/45 p-4 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">Mode</dt>
            <dd>{serverMode}</dd>
            <dt className="text-muted-foreground">Compute</dt>
            <dd>{computeTarget === 'kenkui-cloud' ? 'Kengui Cloud' : 'Local'}</dd>
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
                <dt className="text-muted-foreground">Workers</dt>
                <dd>{workers || 'Backend default'}</dd>
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
                : 'Kengui starts one local kenkui runtime. Parallel chapter synthesis is controlled by the backend workers setting.'}
            </p>
          )}

          {diagnosticError && (
            <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {diagnosticError}
            </p>
          )}

          {versionWarning && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            >
              {versionWarning}
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
                    {logs.length > 0
                      ? `${logs.length} retained line${logs.length === 1 ? '' : 's'} from runtime diagnostics`
                      : 'No server or worker log source is available.'}
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
    </>
  );
}
