export type ServerMode = 'local' | 'external' | 'hosted';

export interface RuntimeHealth {
  status: string;
  version?: string;
  api_version?: string;
  server_version?: string;
  capabilities?: string[];
  message?: string;
}

export interface LocalRuntimeStatus {
  available: boolean;
  running: boolean;
  pid: number | null;
  last_error: string | null;
  log_tail: string[];
}

export type BookFileSelection = string | null;

export interface StoredSettings {
  serverMode: ServerMode;
  serverUrl: string;
}

export type Unlisten = () => void;
