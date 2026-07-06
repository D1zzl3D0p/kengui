import { useEffect, useMemo, useState } from 'react';
import {
  createRuntimeAdapter,
  type LocalRuntimeStatus,
  type RuntimeHealth,
} from '../runtime/runtime';
import { useConnectionStore } from '../store/connection';

export type LogOrder = 'newest' | 'oldest';

function lineMatchesSeverity(line: string, filter: string): boolean {
  if (filter === 'all') return true;
  return line.toLowerCase().includes(filter);
}

export type DiagnosticsController = ReturnType<typeof useDiagnostics>;

/**
 * Owns the runtime diagnostics side-effect: health/status/log polling plus the
 * restart and copy-logs actions. Shared so any Settings section can read runtime
 * health (e.g. provider-capability gating) from a single source of truth.
 */
export function useDiagnostics() {
  const { serverMode, serverUrl } = useConnectionStore();
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

  const localRuntimeManagement =
    serverMode === 'local' && health ? (status?.running ? 'managed' : 'attached') : null;

  async function refreshDiagnostics() {
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    setRefreshing(true);
    setDiagnosticError(null);
    try {
      const [nextHealth, nextStatus] = await Promise.all([
        runtime.health(),
        runtime.status(),
      ]);
      let nextLogs: string[] = [];
      if (serverMode === 'local') {
        try {
          nextLogs = await runtime.logs();
        } catch (error) {
          nextLogs = nextStatus?.log_tail ?? [];
          setDiagnosticError(
            error instanceof Error
              ? `Runtime log command failed: ${error.message}`
              : 'Runtime log command failed.'
          );
        }
      }
      setHealth(nextHealth);
      setStatus(nextStatus);
      setLogs(nextLogs.length > 0 ? nextLogs : (nextStatus?.log_tail ?? []));
    } catch (error) {
      setHealth(null);
      if (serverMode === 'local') {
        try {
          const nextStatus = await runtime.status();
          let nextLogs = nextStatus?.log_tail ?? [];
          try {
            nextLogs = await runtime.logs();
          } catch (logError) {
            setDiagnosticError(
              logError instanceof Error
                ? `Runtime check failed. Runtime log command failed: ${logError.message}`
                : 'Runtime check failed. Runtime log command failed.'
            );
          }
          setStatus(nextStatus);
          setLogs(nextLogs);
        } catch {
          setStatus(null);
          setLogs([]);
        }
      }
      setDiagnosticError((current) => current ?? (error instanceof Error ? error.message : 'Runtime check failed.'));
    } finally {
      setRefreshing(false);
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

  useEffect(() => {
    refreshDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, serverUrl]);

  return {
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
    refreshDiagnostics,
    handleRestart,
    handleCopyLogs,
  };
}
