import { create } from 'zustand';
import { nativeStore, type ConnectionAuthMode, type ServerMode } from '../platform';

export type { ConnectionAuthMode, ServerMode } from '../platform';

export type ConnectionStatus = 'checking' | 'connected' | 'error' | 'not_found';

interface ConnectionState {
  serverMode: ServerMode;
  serverUrl: string;
  authMode: ConnectionAuthMode;
  lastConnectedAt: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  setServerMode: (
    mode: ServerMode,
    url?: string,
    authMode?: ConnectionAuthMode
  ) => Promise<void>;
  markConnected: () => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionError: (message: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  authMode: 'none',
  lastConnectedAt: null,
  connectionStatus: 'checking',
  connectionError: null,

  setServerMode: async (mode, url, authMode = mode === 'hosted' ? 'supabase' : 'none') => {
    const serverUrl = url ?? 'http://localhost:45365';
    const { lastConnectedAt } = useConnectionStore.getState();
    await nativeStore.saveSettings({ serverMode: mode, serverUrl, authMode, lastConnectedAt });
    set({ serverMode: mode, serverUrl, authMode, connectionError: null });
  },

  markConnected: async () => {
    const { serverMode, serverUrl, authMode } = useConnectionStore.getState();
    const lastConnectedAt = new Date().toISOString();
    await nativeStore.saveSettings({ serverMode, serverUrl, authMode, lastConnectedAt });
    set({ lastConnectedAt });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (connectionError) => set({ connectionError }),
}));

export async function loadPersistedSettings(): Promise<void> {
  const { serverMode, serverUrl, authMode, lastConnectedAt } = await nativeStore.loadSettings();
  useConnectionStore.setState({
    serverMode,
    serverUrl,
    authMode,
    lastConnectedAt,
    connectionError: null,
  });
}
