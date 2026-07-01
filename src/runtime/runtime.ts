import { resolveServerBaseUrl } from '../api/serverUrl';
import { validateCloudConnection } from '../api/cloudClient';
import { useConnectionStore } from '../store/connection';
import { getAccessToken, refreshSupabaseSession } from '../auth/supabase';
import { nativeCommands } from '../platform';
import type { LocalRuntimeStatus, RuntimeHealth, ServerMode } from '../platform';

export type { LocalRuntimeStatus, RuntimeHealth } from '../platform';

export class RuntimeCompatibilityError extends Error {
  constructor(message: string, public readonly missingCapabilities: string[] = []) {
    super(message);
    this.name = 'RuntimeCompatibilityError';
  }
}

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
  if (mode === 'hosted') {
    await validateCloudConnection();
    return { status: 'healthy', capabilities: ['kenkui-cloud'] };
  }

  const headers = new Headers();
  if (useConnectionStore.getState().authMode === 'supabase') {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  let res = await fetch(`${resolveServerBaseUrl(serverUrl, mode)}/health`, { headers });
  if ((res.status === 401 || res.status === 403) && useConnectionStore.getState().authMode === 'supabase') {
    const refreshed = await refreshSupabaseSession();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      res = await fetch(`${resolveServerBaseUrl(serverUrl, mode)}/health`, { headers });
    }
  }
  if (!res.ok) {
    throw new Error(`Server health check failed with ${res.status}`);
  }
  const health = await res.json() as RuntimeHealth;
  if (mode === 'local') {
    assertLocalRuntimeCompatible(health);
  }
  return health;
}

export function missingCapabilities(
  health: RuntimeHealth | null | undefined,
  requiredCapabilities: readonly string[]
): string[] {
  const capabilities = new Set(health?.capabilities ?? []);
  return requiredCapabilities.filter((capability) => !capabilities.has(capability));
}

export function supportsCapability(
  health: RuntimeHealth | null | undefined,
  capability: string
): boolean {
  return !missingCapabilities(health, [capability]).length;
}

export function assertLocalRuntimeCompatible(health: RuntimeHealth): RuntimeHealth {
  return health;
}

export function supportsProviderModels(health: RuntimeHealth | null | undefined): boolean {
  return supportsCapability(health, 'provider-models');
}

export function supportsProviderCredentials(health: RuntimeHealth | null | undefined): boolean {
  return supportsCapability(health, 'provider-credentials');
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
