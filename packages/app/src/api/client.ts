import { useConnectionStore } from '../store/connection';
import { getAccessToken, refreshSupabaseSession } from '../auth/supabase';
import { resolveServerBaseUrl } from './serverUrl';

const API_PREFIX = '/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeaders(options?: RequestInit): Promise<HeadersInit> {
  const headers = new Headers(options?.headers ?? { 'Content-Type': 'application/json' });
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (useConnectionStore.getState().authMode === 'supabase') {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: await authHeaders(options),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const { serverMode, serverUrl } = useConnectionStore.getState();
  const baseUrl = resolveServerBaseUrl(serverUrl, serverMode);
  try {
    return await request<T>(`${baseUrl}${API_PREFIX}${path}`, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      const refreshed = await refreshSupabaseSession();
      if (refreshed) {
        return request<T>(`${baseUrl}${API_PREFIX}${path}`, options);
      }
    }
    if (error instanceof ApiError && error.status === 404) {
      return request<T>(`${baseUrl}${path}`, options);
    }
    throw error;
  }
}
