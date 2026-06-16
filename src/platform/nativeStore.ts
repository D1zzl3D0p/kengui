import { load } from '@tauri-apps/plugin-store';

import type { ServerMode, StoredSettings } from './types';

const SETTINGS_FILE = 'settings.json';
const DEFAULT_SETTINGS: StoredSettings = {
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
};

function readLocalStorageSetting<K extends keyof StoredSettings>(
  key: K
): StoredSettings[K] | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(key);
  return value === null ? null : (value as StoredSettings[K]);
}

function writeLocalStorageSettings(settings: StoredSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('serverMode', settings.serverMode);
  localStorage.setItem('serverUrl', settings.serverUrl);
}

export interface NativeSettingsStore {
  loadSettings: () => Promise<StoredSettings>;
  saveSettings: (settings: StoredSettings) => Promise<void>;
}

export const nativeStore: NativeSettingsStore = {
  async loadSettings() {
    try {
      const store = await load(SETTINGS_FILE);
      return {
        serverMode:
          (await store.get<ServerMode>('serverMode')) ??
          DEFAULT_SETTINGS.serverMode,
        serverUrl:
          (await store.get<string>('serverUrl')) ?? DEFAULT_SETTINGS.serverUrl,
      };
    } catch {
      return {
        serverMode:
          readLocalStorageSetting('serverMode') ?? DEFAULT_SETTINGS.serverMode,
        serverUrl: readLocalStorageSetting('serverUrl') ?? DEFAULT_SETTINGS.serverUrl,
      };
    }
  },

  async saveSettings(settings) {
    try {
      const store = await load(SETTINGS_FILE);
      await store.set('serverMode', settings.serverMode);
      await store.set('serverUrl', settings.serverUrl);
      await store.save();
    } catch {
      writeLocalStorageSettings(settings);
    }
  },
};
