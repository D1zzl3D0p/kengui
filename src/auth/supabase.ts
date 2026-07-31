import { getSupabaseClient, supabaseConfigured } from './supabaseClient';

export interface AuthSessionSummary {
  email: string | null;
  provider: string | null;
  expiresAt: number;
}

export type SupabaseOAuthProvider = 'google' | 'github' | 'apple';

export { supabaseConfigured };

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

export function supabaseProviderCallbackUrl(): string {
  const override = import.meta.env.VITE_SUPABASE_PROVIDER_CALLBACK_URL;
  if (override) return override.replace(/\/$/, '');
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Supabase URL is not configured.');
  return `${new URL(url).origin}/auth/v1/callback`;
}

function redirectUrl(override?: string): string {
  if (override) return override;
  if (typeof window === 'undefined') return 'kengui://auth/callback';
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}/connect`;
  }
  return 'kengui://auth/callback';
}

function summarize(session: unknown): AuthSessionSummary {
  const s = (session ?? {}) as {
    access_token?: string;
    expires_at?: number;
    user?: { email?: unknown; app_metadata?: { provider?: unknown } };
  };
  const provider = s.user?.app_metadata?.provider;
  return {
    email: typeof s.user?.email === 'string' ? s.user.email : null,
    provider: typeof provider === 'string' ? provider : null,
    expiresAt: typeof s.expires_at === 'number' ? s.expires_at : 0,
  };
}

export async function startSupabaseOAuth(
  provider: SupabaseOAuthProvider,
  redirectTo?: string
): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl(redirectTo), skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new Error(error?.message ?? 'Could not start sign in.');
  return data.url;
}

export async function exchangeSupabaseCode(callbackUrl: string): Promise<AuthSessionSummary> {
  const callbackError = supabaseOAuthErrorMessage(callbackUrl);
  if (callbackError) throw new Error(callbackError);

  const code = firstCallbackParam(callbackUrl, 'code');
  if (!code) throw new Error('Could not complete sign in. Start the login again.');

  const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error || !data?.session) throw new Error(error?.message ?? 'Sign in failed.');
  return summarize(data.session);
}

export async function loadAuthSessionSummary(): Promise<AuthSessionSummary | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session ? summarize(data.session) : null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function refreshSupabaseSession(): Promise<AuthSessionSummary | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await getSupabaseClient().auth.refreshSession();
  if (error || !data?.session) return null;
  return summarize(data.session);
}

export async function clearAuthSession(): Promise<void> {
  if (!supabaseConfigured()) return;
  await getSupabaseClient().auth.signOut({ scope: 'local' });
}
