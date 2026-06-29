export type ServerMode = 'local' | 'external' | 'hosted';
export type ConnectionAuthMode = 'none' | 'supabase';

export interface RuntimeHealth {
  status: string;
  version?: string;
  api_version?: string;
  server_version?: string;
  capabilities?: string[];
  message?: string;
}

export type LocalRuntimeManagement = 'managed' | 'attached';

export interface LocalRuntimeStatus {
  available: boolean;
  running: boolean;
  pid: number | null;
  last_error: string | null;
  port_owner: string | null;
  log_tail: string[];
}

export type BookFileSelection = string | null;

export interface StoredSettings {
  serverMode: ServerMode;
  serverUrl: string;
  authMode: ConnectionAuthMode;
  lastConnectedAt: string | null;
}

export type Unlisten = () => void;
