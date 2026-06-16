import { resolveServerBaseUrl } from '../api/serverUrl';
import { useConnectionStore } from '../store/connection';
import { nativeCommands } from '../platform';
import type { LocalRuntimeStatus, RuntimeHealth, ServerMode } from '../platform';

export type { LocalRuntimeStatus, RuntimeHealth } from '../platform';

export interface RuntimeAdapter {
  mode: ServerMode;
  checkAvailable: () => Promise<boolean>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  status: () => Promise<LocalRuntimeStatus | null>;
  logs: () => Promise<string[]>;
  health: () => Promise<RuntimeHealth>;
}

async function fetchHealth(serverUrl: string, mode: ServerMode): Promise<RuntimeHealth> {
  const res = await fetch(`${resolveServerBaseUrl(serverUrl, mode)}/health`);
  if (!res.ok) {
    throw new Error(`Server health check failed with ${res.status}`);
  }
  return res.json() as Promise<RuntimeHealth>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRuntimeHealth(
  runtime: Pick<RuntimeAdapter, 'health'>,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<RuntimeHealth> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  do {
    try {
      return await runtime.health();
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(intervalMs);
    }
  } while (true);

  throw lastError instanceof Error
    ? lastError
    : new Error('Server health check failed.');
}

export function createRuntimeAdapter(mode: ServerMode, serverUrl: string): RuntimeAdapter {
  if (mode === 'local') {
    return {
      mode,
      checkAvailable: nativeCommands.checkServerRuntime,
      start: nativeCommands.spawnServer,
      stop: nativeCommands.killServer,
      restart: async () => {
        await nativeCommands.killServer();
        await nativeCommands.spawnServer();
      },
      status: nativeCommands.serverStatus,
      logs: nativeCommands.serverLogs,
      health: () => fetchHealth(serverUrl, mode),
    };
  }

  return {
    mode,
    checkAvailable: async () => true,
    start: async () => undefined,
    stop: async () => undefined,
    restart: async () => undefined,
    status: async () => null,
    logs: async () => [],
    health: () => fetchHealth(serverUrl, mode),
  };
}

export function currentRuntimeAdapter(): RuntimeAdapter {
  const { serverMode, serverUrl } = useConnectionStore.getState();
  return createRuntimeAdapter(serverMode, serverUrl);
}
