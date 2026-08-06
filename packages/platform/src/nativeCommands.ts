import { invoke } from '@tauri-apps/api/core';

import { browserDownloadName, getBrowserFile } from './browserFiles';
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

const BOOK_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  fb2: 'application/x-fictionbook+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
});

function browserFileContentType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BOOK_CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

async function browserFileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedBrowserUpload(file: File, url: string, contentType: string): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!response.ok) throw new Error(`Signed upload failed with ${response.status}.`);
}

function startBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
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
  fileStat: (path) => {
    const file = getBrowserFile(path);
    if (file) {
      return Promise.resolve({
        path,
        filename: file.name,
        byteSize: file.size,
        contentType: browserFileContentType(file),
      });
    }
    return invokeOrBrowserFallback('file_stat', {
      path,
      filename: path.split(/[\\/]/).pop() || path,
      byteSize: 0,
      contentType: 'application/octet-stream',
    }, { path });
  },
  fileSha256: (path) => {
    const file = getBrowserFile(path);
    return file ? browserFileSha256(file) : invokeOrBrowserFallback('file_sha256', '', { path });
  },
  signedUploadFile: (args) => {
    const file = getBrowserFile(args.path);
    return file
      ? signedBrowserUpload(file, args.url, args.contentType)
      : invokeOrBrowserFallback('signed_upload_file', undefined, { ...args });
  },
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
  signedDownloadFile: (args) => {
    const browserFilename = browserDownloadName(args.outputPath);
    if (browserFilename && typeof document !== 'undefined') {
      startBrowserDownload(args.url, browserFilename);
      return Promise.resolve();
    }
    return invokeOrBrowserFallback('signed_download_file', undefined, { ...args });
  },
};
