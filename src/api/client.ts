import { useConnectionStore } from '../store/connection';
import { resolveServerBaseUrl } from './serverUrl';

const API_PREFIX = '/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
    if (error instanceof ApiError && error.status === 404) {
      return request<T>(`${baseUrl}${path}`, options);
    }
    throw error;
  }
}
