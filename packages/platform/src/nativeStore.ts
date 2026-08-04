import { load } from '@tauri-apps/plugin-store';

import type { ComputeTarget, ConnectionAuthMode, ServerMode, StoredSettings } from './types';

const SETTINGS_FILE = 'settings.json';
const DEFAULT_SETTINGS: StoredSettings = {
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  authMode: 'none',
  computeTarget: 'local',
  lastConnectedAt: null,
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
  localStorage.setItem('authMode', settings.authMode);
  localStorage.setItem('computeTarget', settings.computeTarget);
  if (settings.lastConnectedAt) {
    localStorage.setItem('lastConnectedAt', settings.lastConnectedAt);
  } else {
    localStorage.removeItem('lastConnectedAt');
  }
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
        authMode:
          (await store.get<ConnectionAuthMode>('authMode')) ??
          DEFAULT_SETTINGS.authMode,
        computeTarget:
          (await store.get<ComputeTarget>('computeTarget')) ??
          DEFAULT_SETTINGS.computeTarget,
        lastConnectedAt:
          (await store.get<string>('lastConnectedAt')) ??
          DEFAULT_SETTINGS.lastConnectedAt,
      };
    } catch {
      return {
        serverMode:
          readLocalStorageSetting('serverMode') ?? DEFAULT_SETTINGS.serverMode,
        serverUrl: readLocalStorageSetting('serverUrl') ?? DEFAULT_SETTINGS.serverUrl,
        authMode: readLocalStorageSetting('authMode') ?? DEFAULT_SETTINGS.authMode,
        computeTarget:
          readLocalStorageSetting('computeTarget') ?? DEFAULT_SETTINGS.computeTarget,
        lastConnectedAt:
          readLocalStorageSetting('lastConnectedAt') ?? DEFAULT_SETTINGS.lastConnectedAt,
      };
    }
  },

  async saveSettings(settings) {
    try {
      const store = await load(SETTINGS_FILE);
      await store.set('serverMode', settings.serverMode);
      await store.set('serverUrl', settings.serverUrl);
      await store.set('authMode', settings.authMode);
      await store.set('computeTarget', settings.computeTarget);
      await store.set('lastConnectedAt', settings.lastConnectedAt);
      await store.save();
    } catch {
      writeLocalStorageSettings(settings);
    }
  },
};
