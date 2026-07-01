import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nativeCommands } from './nativeCommands';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('nativeCommands', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('maps runtime methods to Tauri command names', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await nativeCommands.checkServerRuntime();
    await nativeCommands.spawnServer();
    await nativeCommands.killServer();
    await nativeCommands.serverStatus();
    await nativeCommands.serverLogs();
    await nativeCommands.openOutputFolder('/books/Test Book.m4b');
    await nativeCommands.fileStat('/books/Test Book.epub');
    await nativeCommands.signedUploadFile({
      path: '/books/Test Book.epub',
      url: 'https://r2.example/upload',
      contentType: 'application/epub+zip',
    });
    await nativeCommands.signedUploadText({
      text: '{}',
      url: 'https://r2.example/upload-job',
      contentType: 'application/json',
    });
    await nativeCommands.signedDownloadFile({
      url: 'https://r2.example/download',
      outputPath: '/downloads/Test Book.m4b',
    });

    expect(invoke).toHaveBeenCalledWith('check_server_runtime');
    expect(invoke).toHaveBeenCalledWith('spawn_server');
    expect(invoke).toHaveBeenCalledWith('kill_server');
    expect(invoke).toHaveBeenCalledWith('server_status');
    expect(invoke).toHaveBeenCalledWith('server_logs');
    expect(invoke).toHaveBeenCalledWith('open_output_folder', {
      path: '/books/Test Book.m4b',
    });
    expect(invoke).toHaveBeenCalledWith('file_stat', {
      path: '/books/Test Book.epub',
    });
    expect(invoke).toHaveBeenCalledWith('signed_upload_file', {
      path: '/books/Test Book.epub',
      url: 'https://r2.example/upload',
      contentType: 'application/epub+zip',
    });
    expect(invoke).toHaveBeenCalledWith('signed_upload_text', {
      text: '{}',
      url: 'https://r2.example/upload-job',
      contentType: 'application/json',
    });
    expect(invoke).toHaveBeenCalledWith('signed_download_file', {
      url: 'https://r2.example/download',
      outputPath: '/downloads/Test Book.m4b',
    });
  });

  it('uses safe fallbacks when Tauri commands are unavailable in browser tests', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('unavailable'));

    await expect(nativeCommands.checkServerRuntime()).resolves.toBe(false);
    await expect(nativeCommands.spawnServer()).resolves.toBeUndefined();
    await expect(nativeCommands.openOutputFolder('/books/Test Book.m4b')).resolves.toBeUndefined();
    await expect(nativeCommands.serverLogs()).resolves.toEqual([]);
    await expect(nativeCommands.serverStatus()).resolves.toMatchObject({
      available: false,
      running: false,
    });
  });

  it('surfaces native command failures in desktop mode', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('spawn failed'));

    await expect(nativeCommands.spawnServer()).rejects.toThrow('spawn failed');
  });
});
