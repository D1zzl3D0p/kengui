import { invoke } from '@tauri-apps/api/core';

import type { LocalRuntimeStatus } from './types';

export interface NativeRuntimeCommands {
  checkServerRuntime: () => Promise<boolean>;
  spawnServer: () => Promise<void>;
  killServer: () => Promise<void>;
  serverStatus: () => Promise<LocalRuntimeStatus>;
  serverLogs: () => Promise<string[]>;
}

async function invokeOrFallback<T>(
  command: string,
  fallback: T
): Promise<T> {
  try {
    return await invoke<T>(command);
  } catch {
    return fallback;
  }
}

export const nativeCommands: NativeRuntimeCommands = {
  checkServerRuntime: () => invokeOrFallback('check_server_runtime', false),
  spawnServer: () => invokeOrFallback('spawn_server', undefined),
  killServer: () => invokeOrFallback('kill_server', undefined),
  serverStatus: () =>
    invokeOrFallback('server_status', {
      available: false,
      running: false,
      pid: null,
      last_error: 'Tauri runtime is unavailable.',
      log_tail: [],
    }),
  serverLogs: () => invokeOrFallback('server_logs', []),
};
