import { invoke } from '@tauri-apps/api/core';

import type { LocalRuntimeStatus } from './types';

export interface NativeRuntimeCommands {
  checkServerRuntime: () => Promise<boolean>;
  spawnServer: () => Promise<void>;
  killServer: () => Promise<void>;
  serverStatus: () => Promise<LocalRuntimeStatus>;
  serverLogs: () => Promise<string[]>;
  openOutputFolder: (path: string) => Promise<void>;
}

function isTauriUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('__TAURI_INTERNALS__') ||
    message.includes('not available') ||
    message.includes('Tauri') ||
    message.includes('unavailable')
  );
}

async function invokeOrBrowserFallback<T>(
  command: string,
  fallback: T,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return args === undefined ? await invoke<T>(command) : await invoke<T>(command, args);
  } catch (error) {
    if (!isTauriUnavailable(error)) {
      throw error;
    }
    return fallback;
  }
}

export const nativeCommands: NativeRuntimeCommands = {
  checkServerRuntime: () => invokeOrBrowserFallback('check_server_runtime', false),
  spawnServer: () => invokeOrBrowserFallback('spawn_server', undefined),
  killServer: () => invokeOrBrowserFallback('kill_server', undefined),
  serverStatus: () =>
    invokeOrBrowserFallback('server_status', {
      available: false,
      running: false,
      pid: null,
      last_error: 'Tauri runtime is unavailable.',
      port_owner: null,
      log_tail: [],
    }),
  serverLogs: () => invokeOrBrowserFallback('server_logs', []),
  openOutputFolder: (path) =>
    invokeOrBrowserFallback('open_output_folder', undefined, { path }),
};
