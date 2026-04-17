import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';

export type ServerMode = 'local' | 'external';
export type ConnectionStatus = 'checking' | 'connected' | 'error' | 'not_found';

interface ConnectionState {
  serverMode: ServerMode;
  serverUrl: string;
  connectionStatus: ConnectionStatus;
  setServerMode: (mode: ServerMode, url?: string) => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  connectionStatus: 'checking',

  setServerMode: async (mode, url) => {
    const serverUrl = url ?? 'http://localhost:45365';
    const store = await load('settings.json');
    await store.set('serverMode', mode);
    await store.set('serverUrl', serverUrl);
    await store.save();
    set({ serverMode: mode, serverUrl });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));

export async function loadPersistedSettings(): Promise<void> {
  const store = await load('settings.json');
  const serverMode = (await store.get<ServerMode>('serverMode')) ?? 'local';
  const serverUrl =
    (await store.get<string>('serverUrl')) ?? 'http://localhost:45365';
  useConnectionStore.setState({ serverMode, serverUrl });
}
