import { listen } from '@tauri-apps/api/event';

import type { Unlisten } from './types';

export interface NativeRuntimeEvents {
  onServerReady: (callback: () => void) => Promise<Unlisten>;
  onServerError: (callback: () => void) => Promise<Unlisten>;
}

async function listenOrNoop<T>(
  event: string,
  callback: (payload: T) => void
): Promise<Unlisten> {
  try {
    return await listen<T>(event, () => callback(undefined as T));
  } catch {
    return () => {};
  }
}

export const nativeEvents: NativeRuntimeEvents = {
  onServerReady: (callback) => listenOrNoop('server-ready', callback),
  onServerError: (callback) => listenOrNoop('server-error', callback),
};
