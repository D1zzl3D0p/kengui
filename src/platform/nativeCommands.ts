import { invoke } from '@tauri-apps/api/core';

import type { LocalRuntimeStatus } from './types';

export interface NativeRuntimeCommands {
  checkServerRuntime: () => Promise<boolean>;
  spawnServer: () => Promise<void>;
  killServer: () => Promise<void>;
  serverStatus: () => Promise<LocalRuntimeStatus>;
  serverLogs: () => Promise<string[]>;
  openOutputFolder: (path: string) => Promise<void>;
  fileStat: (path: string) => Promise<NativeFileStat>;
  fileSha256: (path: string) => Promise<string>;
  signedUploadFile: (args: SignedUploadFileArgs) => Promise<void>;
  signedUploadText: (args: SignedUploadTextArgs) => Promise<void>;
  signedDownloadFile: (args: SignedDownloadFileArgs) => Promise<void>;
}

export interface NativeFileStat {
  path: string;
  filename: string;
  byteSize: number;
  contentType: string;
}

export interface SignedUploadFileArgs {
  path: string;
  url: string;
  contentType: string;
}

export interface SignedUploadTextArgs {
  text: string;
  url: string;
  contentType: string;
}

export interface SignedDownloadFileArgs {
  url: string;
  outputPath: string;
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
  fileStat: (path) => invokeOrBrowserFallback('file_stat', {
    path,
    filename: path.split(/[\\/]/).pop() || path,
    byteSize: 0,
    contentType: 'application/octet-stream',
  }, { path }),
  fileSha256: (path) => invokeOrBrowserFallback('file_sha256', '', { path }),
  signedUploadFile: (args) =>
    invokeOrBrowserFallback('signed_upload_file', undefined, { ...args }),
  signedUploadText: async ({ text, url, contentType }) => {
    try {
      await invoke('signed_upload_text', { text, url, contentType });
    } catch (error) {
      if (!isTauriUnavailable(error)) throw error;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: text,
      });
      if (!response.ok) throw new Error(`Signed upload failed with ${response.status}.`);
    }
  },
  signedDownloadFile: (args) =>
    invokeOrBrowserFallback('signed_download_file', undefined, { ...args }),
};
