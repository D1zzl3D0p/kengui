import { secureStore, type StoredAuthSession } from '../platform';
import { useConnectionStore } from '../store/connection';
import { normalizeSupabaseBaseUrl } from '../lib/cloudUrls';

const PKCE_VERIFIER_KEY = 'kengui.pkce.verifier';
const PKCE_STATE_KEY = 'kengui.pkce.state';
const PKCE_SUPABASE_URL_KEY = 'kengui.pkce.supabaseUrl';

export interface AuthSessionSummary {
  email: string | null;
  provider: string | null;
  expiresAt: number;
}

export type SupabaseOAuthProvider = 'google' | 'github' | 'apple';

export function supabaseConfigured(supabaseBaseUrl?: string): boolean {
  return Boolean(resolveSupabaseUrl(supabaseBaseUrl) && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function resolveSupabaseUrl(override?: string): string | null {
  if (override) return normalizeSupabaseBaseUrl(override);
  const { serverMode, serverUrl } = useConnectionStore.getState();
  if (serverMode === 'hosted') return normalizeSupabaseBaseUrl(serverUrl);
  const url = import.meta.env.VITE_SUPABASE_URL;
  return url ? normalizeSupabaseBaseUrl(url) : null;
}

function supabaseUrl(override?: string): string {
  const url = resolveSupabaseUrl(override);
  if (!url) throw new Error('Supabase URL is not configured.');
  return url;
}

function supabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Supabase anon key is not configured.');
  return key;
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
  const state = randomBase64Url(24);
  const baseUrl = supabaseUrl(supabaseBaseUrl);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(PKCE_SUPABASE_URL_KEY, baseUrl);

  const params = new URLSearchParams({
    provider,
    redirect_to: redirectUrl(redirectTo),
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 'S256',
    state,
  });
  return `${baseUrl}/auth/v1/authorize?${params}`;
}

function normalizeSession(data: any): StoredAuthSession {
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
  };
}

export async function exchangeSupabaseCode(callbackUrl: string): Promise<StoredAuthSession> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!code || !verifier || (expectedState && state !== expectedState)) {
    throw new Error('Could not complete sign in. Start the login again.');
  }

  const baseUrl = sessionStorage.getItem(PKCE_SUPABASE_URL_KEY) ?? undefined;
  const response = await fetch(`${supabaseUrl(baseUrl)}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`Sign in failed with ${response.status}.`);
  }

  const session = normalizeSession(await response.json());
  await secureStore.saveSession(session);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
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
  return (await secureStore.loadSession())?.accessToken ?? null;
}

export async function refreshSupabaseSession(): Promise<StoredAuthSession | null> {
  const current = await secureStore.loadSession();
  if (!current?.refreshToken) return null;
  const response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });
  if (!response.ok) {
    await secureStore.clearSession();
    return null;
  }
  const session = normalizeSession(await response.json());
  await secureStore.saveSession(session);
  return session;
}

export async function clearAuthSession(): Promise<void> {
  await secureStore.clearSession();
}
