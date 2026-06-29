import { invoke } from '@tauri-apps/api/core';

const SESSION_KEY = 'kengui.supabase.session';

export interface StoredAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string | null;
  provider: string | null;
}

export interface SecureSessionStore {
  loadSession: () => Promise<StoredAuthSession | null>;
  saveSession: (session: StoredAuthSession) => Promise<void>;
  clearSession: () => Promise<void>;
}

function readFallback(): StoredAuthSession | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredAuthSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function writeFallback(session: StoredAuthSession): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearFallback(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export const secureStore: SecureSessionStore = {
  async loadSession() {
    try {
      return await invoke<StoredAuthSession | null>('load_auth_session');
    } catch {
      return readFallback();
    }
  },

  async saveSession(session) {
    try {
      await invoke('save_auth_session', { session });
    } catch {
      writeFallback(session);
    }
  },

  async clearSession() {
    try {
      await invoke('clear_auth_session');
    } catch {
      clearFallback();
    }
  },
};
