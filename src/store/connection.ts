import { create } from 'zustand';
import { nativeStore, type ServerMode } from '../platform';

export type { ServerMode } from '../platform';

export type ConnectionStatus = 'checking' | 'connected' | 'error' | 'not_found';

interface ConnectionState {
  serverMode: ServerMode;
  serverUrl: string;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  setServerMode: (mode: ServerMode, url?: string) => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionError: (message: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  connectionStatus: 'checking',
  connectionError: null,

  setServerMode: async (mode, url) => {
    const serverUrl = url ?? 'http://localhost:45365';
    await nativeStore.saveSettings({ serverMode: mode, serverUrl });
    set({ serverMode: mode, serverUrl, connectionError: null });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (connectionError) => set({ connectionError }),
}));

export async function loadPersistedSettings(): Promise<void> {
  const { serverMode, serverUrl } = await nativeStore.loadSettings();
  useConnectionStore.setState({ serverMode, serverUrl, connectionError: null });
}
