import type { ServerMode } from '../store/connection';

const DEV_PROXY_PREFIX = '/kenkui-api';
const TAURI_DEV_ORIGIN = 'http://localhost:1420';

export function resolveServerBaseUrl(serverUrl: string, mode: ServerMode): string {
  if (
    mode === 'local' &&
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.origin === TAURI_DEV_ORIGIN
  ) {
    return DEV_PROXY_PREFIX;
  }

  return serverUrl.replace(/\/$/, '');
}
