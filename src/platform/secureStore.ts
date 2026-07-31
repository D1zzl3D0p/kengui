import { invoke } from '@tauri-apps/api/core';

const STORAGE_SLOT_KEY = 'kengui.supabase.session';

export interface SecureKvStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let cache: Record<string, string> | null = null;
let hydration: Promise<Record<string, string>> | null = null;

async function readBlob(): Promise<string | null> {
  try {
    return await invoke<string | null>('load_auth_session');
  } catch {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_SLOT_KEY);
  }
}

async function writeBlob(value: string): Promise<void> {
  try {
    await invoke('save_auth_session', { value });
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_SLOT_KEY, value);
  }
}

async function clearBlob(): Promise<void> {
  try {
    await invoke('clear_auth_session');
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_SLOT_KEY);
  }
}

async function hydrate(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!hydration) {
    hydration = (async () => {
      const raw = await readBlob();
      try {
        cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        cache = {};
      }
      return cache;
    })();
  }
  return hydration;
}

async function persist(map: Record<string, string>): Promise<void> {
  if (Object.keys(map).length === 0) await clearBlob();
  else await writeBlob(JSON.stringify(map));
}

export const secureKv: SecureKvStorage = {
  async getItem(key) {
    const map = await hydrate();
    return map[key] ?? null;
  },
  async setItem(key, value) {
    const map = await hydrate();
    map[key] = value;
    await persist(map);
  },
  async removeItem(key) {
    const map = await hydrate();
    if (key in map) {
      delete map[key];
      await persist(map);
    }
  },
};
