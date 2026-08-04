import { create } from 'zustand';
import { nativeStore, type ComputeTarget, type ConnectionAuthMode, type ServerMode } from '../platform';

export type { ComputeTarget, ConnectionAuthMode, ServerMode } from '../platform';

export type ConnectionStatus = 'checking' | 'connected' | 'error' | 'not_found';

interface ConnectionState {
  serverMode: ServerMode;
  serverUrl: string;
  authMode: ConnectionAuthMode;
  computeTarget: ComputeTarget;
  lastConnectedAt: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  setServerMode: (
    mode: ServerMode,
    url?: string,
    authMode?: ConnectionAuthMode
  ) => Promise<void>;
  setComputeTarget: (target: ComputeTarget) => Promise<void>;
  markConnected: () => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionError: (message: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  authMode: 'none',
  computeTarget: 'local',
  lastConnectedAt: null,
  connectionStatus: 'checking',
  connectionError: null,

  setServerMode: async (mode, url, authMode = mode === 'hosted' ? 'supabase' : 'none') => {
    const serverUrl = url ?? 'http://localhost:45365';
    const { computeTarget, lastConnectedAt } = useConnectionStore.getState();
    await nativeStore.saveSettings({ serverMode: mode, serverUrl, authMode, computeTarget, lastConnectedAt });
    set({ serverMode: mode, serverUrl, authMode, connectionError: null });
  },

  setComputeTarget: async (computeTarget) => {
    const { serverMode, serverUrl, authMode, lastConnectedAt } = useConnectionStore.getState();
    await nativeStore.saveSettings({ serverMode, serverUrl, authMode, computeTarget, lastConnectedAt });
    set({ computeTarget });
  },

  markConnected: async () => {
    const { serverMode, serverUrl, authMode, computeTarget } = useConnectionStore.getState();
    const lastConnectedAt = new Date().toISOString();
    await nativeStore.saveSettings({ serverMode, serverUrl, authMode, computeTarget, lastConnectedAt });
    set({ lastConnectedAt });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionError: (connectionError) => set({ connectionError }),
}));

export async function loadPersistedSettings(): Promise<void> {
  const { serverMode, serverUrl, authMode, computeTarget, lastConnectedAt } = await nativeStore.loadSettings();
  useConnectionStore.setState({
    serverMode,
    serverUrl,
    authMode,
    computeTarget,
    lastConnectedAt,
    connectionError: null,
  });
}
