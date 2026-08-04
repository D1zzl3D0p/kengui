import { getAccessToken, refreshSupabaseSession } from '../auth/supabase';
import { supabaseAnonKey } from '../auth/supabaseClient';
import { useConnectionStore } from '../store/connection';
import { cloudFunctionsUrlForBase } from '../lib/cloudUrls';

export class CloudApiError extends Error {
  public readonly status: number;

  constructor(status: number, message?: string) {
    super(safeCloudApiErrorMessage(message));
    this.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    this.name = 'CloudApiError';
  }
}

const CLOUD_API_GENERIC_ERROR = 'Kengui Cloud request failed.';
const CLOUD_API_CLIENT_MESSAGES = new Set([
  'Sign in to Kengui Cloud before submitting cloud jobs.',
]);

function safeCloudApiErrorMessage(message: string | undefined): string {
  return message && CLOUD_API_CLIENT_MESSAGES.has(message)
    ? message
    : CLOUD_API_GENERIC_ERROR;
}

export function cloudFunctionsUrl(): string {
  const explicit = import.meta.env.VITE_KENKUI_CLOUD_FUNCTIONS_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const { serverMode, serverUrl } = useConnectionStore.getState();
  if (serverMode === 'hosted') return cloudFunctionsUrlForBase(serverUrl);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL is not configured.');
  return cloudFunctionsUrlForBase(supabaseUrl);
}

export function redactSignedUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    const parsed = new URL(url);
    const sensitive = ['X-Amz-Signature', 'X-Amz-Credential', 'X-Amz-Security-Token']
      .some((key) => parsed.searchParams.has(key));
    return sensitive ? '[REDACTED_SIGNED_URL]' : url;
  });
}

async function authHeaders(options?: RequestInit): Promise<Headers> {
  const headers = new Headers(options?.headers ?? {});
  if (!headers.has('Content-Type') && options?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('apikey', supabaseAnonKey());
  const token = await getAccessToken();
  if (!token) throw new CloudApiError(401, 'Sign in to Kengui Cloud before submitting cloud jobs.');
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function request<T>(functionName: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${cloudFunctionsUrl()}/${functionName}`, {
    ...options,
    headers: await authHeaders(options),
  });
  if (!response.ok) {
    throw new CloudApiError(response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function cloudRequest<T>(
  functionName: string,
  options?: RequestInit
): Promise<T> {
  try {
    return await request<T>(functionName, options);
  } catch (error) {
    if (error instanceof CloudApiError && (error.status === 401 || error.status === 403)) {
      const refreshed = await refreshSupabaseSession();
      if (refreshed) return request<T>(functionName, options);
    }
    throw error;
  }
}

export async function validateCloudConnection(): Promise<void> {
  await cloudRequest('list-jobs?limit=1');
}
