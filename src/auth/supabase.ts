import { secureStore, type StoredAuthSession } from '../platform';
import { normalizeSupabaseBaseUrl } from '../lib/cloudUrls';

const PKCE_VERIFIER_KEY = 'kengui.pkce.verifier';
const PKCE_SUPABASE_URL_KEY = 'kengui.pkce.supabaseUrl';
const TOKEN_REFRESH_SKEW_SECONDS = 60;

export interface AuthSessionSummary {
  email: string | null;
  provider: string | null;
  expiresAt: number;
}

export type SupabaseOAuthProvider = 'google' | 'github' | 'apple';

function callbackParamGroups(callbackUrl: string): URLSearchParams[] {
  const url = new URL(callbackUrl);
  const groups = [url.searchParams];
  const hash = url.hash.replace(/^#/, '');
  if (!hash) return groups;

  if (hash.startsWith('/')) {
    groups.push(new URL(hash, url.origin).searchParams);
  } else {
    groups.push(new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash));
  }
  return groups;
}

function firstCallbackParam(callbackUrl: string, name: string): string | null {
  for (const params of callbackParamGroups(callbackUrl)) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

export function supabaseOAuthErrorMessage(callbackUrl: string): string | null {
  const error = firstCallbackParam(callbackUrl, 'error');
  const description = firstCallbackParam(callbackUrl, 'error_description');
  const code = firstCallbackParam(callbackUrl, 'error_code');
  if (!error && !description && !code) return null;

  const detail = description || error || 'Supabase rejected the sign in callback.';
  const suffix = [code, error].filter(Boolean).join(', ');
  return suffix ? `Sign in failed: ${detail} (${suffix}).` : `Sign in failed: ${detail}.`;
}

export function supabaseConfigured(supabaseBaseUrl?: string): boolean {
  return Boolean(resolveSupabaseUrl(supabaseBaseUrl) && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function resolveSupabaseUrl(override?: string): string | null {
  if (override) return normalizeSupabaseBaseUrl(override);
  const url = import.meta.env.VITE_SUPABASE_URL;
  return url ? normalizeSupabaseBaseUrl(url) : null;
}

function supabaseUrl(override?: string): string {
  const url = resolveSupabaseUrl(override);
  if (!url) throw new Error('Supabase URL is not configured.');
  return url;
}

export function supabaseProviderCallbackUrl(supabaseBaseUrl?: string): string {
  const override = import.meta.env.VITE_SUPABASE_PROVIDER_CALLBACK_URL;
  if (override) return override.replace(/\/$/, '');

  const url = new URL(supabaseUrl(supabaseBaseUrl));
  return `${url.origin}/auth/v1/callback`;
}

function supabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Supabase anon key is not configured.');
  return key;
}

function supabaseAuthHeaders(): Record<string, string> {
  const key = supabaseAnonKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function redirectUrl(override?: string): string {
  if (override) return override;
  if (typeof window === 'undefined') return 'kengui://auth/callback';
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}/connect`;
  }
  return 'kengui://auth/callback';
}

export async function createSupabaseOAuthUrl(
  provider: SupabaseOAuthProvider,
  redirectTo?: string,
  supabaseBaseUrl?: string
): Promise<string> {
  const verifier = randomBase64Url(48);
  const baseUrl = supabaseUrl(supabaseBaseUrl);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_SUPABASE_URL_KEY, baseUrl);

  const params = new URLSearchParams({
    provider,
    redirect_to: redirectUrl(redirectTo),
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 's256',
  });
  return `${baseUrl}/auth/v1/authorize?${params}`;
}

function normalizeSession(data: any, authOrigin?: string): StoredAuthSession {
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  const user = data.user ?? {};
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    email: typeof user.email === 'string' ? user.email : null,
    provider:
      typeof user.app_metadata?.provider === 'string'
        ? user.app_metadata.provider
        : null,
    ...(authOrigin ? { authOrigin: normalizeSupabaseBaseUrl(authOrigin) } : {}),
  };
}

async function supabaseTokenErrorMessage(response: Response): Promise<string> {
  let detail = '';
  let code = '';
  try {
    const data = await response.json();
    if (typeof data.error_description === 'string') {
      detail = data.error_description;
    } else if (typeof data.msg === 'string') {
      detail = data.msg;
    } else if (typeof data.message === 'string') {
      detail = data.message;
    } else if (typeof data.error === 'string') {
      detail = data.error;
    }
    if (typeof data.error_code === 'string') {
      code = data.error_code;
    } else if (typeof data.code === 'string') {
      code = data.code;
    }
  } catch {
    // Non-JSON response bodies can contain unsafe upstream diagnostics.
  }
  const codeSuffix = code ? ` (${code})` : '';
  const suffix = detail ? `: ${detail}${codeSuffix}` : code ? ` (${code})` : '';
  return `Supabase token exchange failed with ${response.status}${suffix}.`;
}

export async function exchangeSupabaseCode(callbackUrl: string): Promise<StoredAuthSession> {
  const callbackError = supabaseOAuthErrorMessage(callbackUrl);
  if (callbackError) throw new Error(callbackError);

  const code = firstCallbackParam(callbackUrl, 'code');
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!code || !verifier) {
    throw new Error('Could not complete sign in. Start the login again.');
  }

  const baseUrl = supabaseUrl(sessionStorage.getItem(PKCE_SUPABASE_URL_KEY) ?? undefined);
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: supabaseAuthHeaders(),
    body: JSON.stringify({
      auth_code: code,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(await supabaseTokenErrorMessage(response));
  }

  const session = normalizeSession(await response.json(), baseUrl);
  await secureStore.saveSession(session);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_SUPABASE_URL_KEY);
  return session;
}

export async function loadAuthSessionSummary(): Promise<AuthSessionSummary | null> {
  const session = await secureStore.loadSession();
  if (!session) return null;
  return {
    email: session.email,
    provider: session.provider,
    expiresAt: session.expiresAt,
  };
}

export async function getAccessToken(): Promise<string | null> {
  const session = await secureStore.loadSession();
  if (!session) return null;
  const expiresAt = Number.isFinite(session.expiresAt) ? session.expiresAt : 0;
  const refreshAt = Math.floor(Date.now() / 1000) + TOKEN_REFRESH_SKEW_SECONDS;
  if (expiresAt <= refreshAt) {
    return (await refreshSupabaseSession())?.accessToken ?? null;
  }
  return session.accessToken;
}

export async function refreshSupabaseSession(): Promise<StoredAuthSession | null> {
  const current = await secureStore.loadSession();
  if (!current?.refreshToken) return null;
  const baseUrl = supabaseUrl(current.authOrigin);
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: supabaseAuthHeaders(),
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  if (!response.ok) {
    await secureStore.clearSession();
    return null;
  }
  const session = normalizeSession(await response.json(), baseUrl);
  await secureStore.saveSession(session);
  return session;
}

export async function clearAuthSession(): Promise<void> {
  await secureStore.clearSession();
}
