import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('./supabaseClient', () => ({
  supabaseConfigured: vi.fn(() => true),
  supabaseAnonKey: vi.fn(() => 'anon-key'),
  getSupabaseClient: vi.fn(() => ({ auth })),
}));

import {
  clearAuthSession,
  exchangeSupabaseCode,
  getAccessToken,
  loadAuthSessionSummary,
  refreshSupabaseSession,
  startSupabaseOAuth,
  supabaseOAuthErrorMessage,
  supabaseProviderCallbackUrl,
} from './supabase';

const sessionFixture = {
  access_token: 'access-token',
  expires_at: 1983812996,
  user: { email: 'reader@example.com', app_metadata: { provider: 'github' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});

describe('startSupabaseOAuth', () => {
  it('returns the provider URL and passes redirectTo without browser redirect', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://p.supabase.co/authorize?x=1' }, error: null });
    const url = await startSupabaseOAuth('github', 'http://127.0.0.1:49152/auth/callback');
    expect(url).toBe('https://p.supabase.co/authorize?x=1');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: 'http://127.0.0.1:49152/auth/callback', skipBrowserRedirect: true },
    });
  });

  it('throws when supabase returns an error', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'nope' } });
    await expect(startSupabaseOAuth('github', 'http://127.0.0.1:49152/auth/callback')).rejects.toThrow('nope');
  });
});

describe('exchangeSupabaseCode', () => {
  it('surfaces an OAuth callback error before exchanging', async () => {
    await expect(
      exchangeSupabaseCode('http://localhost:1420/connect#error=access_denied&error_description=Access%20denied')
    ).rejects.toThrow('Sign in failed: Access denied (access_denied).');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges the code and returns a session summary', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: sessionFixture }, error: null });
    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).resolves.toEqual({ email: 'reader@example.com', provider: 'github', expiresAt: 1983812996 });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
  });

  it('throws when no code is present', async () => {
    await expect(exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback')).rejects.toThrow(
      'Could not complete sign in. Start the login again.'
    );
  });
});

describe('session accessors', () => {
  it('getAccessToken returns the current session token', async () => {
    auth.getSession.mockResolvedValue({ data: { session: sessionFixture } });
    await expect(getAccessToken()).resolves.toBe('access-token');
  });

  it('getAccessToken returns null with no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('loadAuthSessionSummary maps the stored session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: sessionFixture } });
    await expect(loadAuthSessionSummary()).resolves.toEqual({
      email: 'reader@example.com', provider: 'github', expiresAt: 1983812996,
    });
  });

  it('refreshSupabaseSession returns null on error', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'x' } });
    await expect(refreshSupabaseSession()).resolves.toBeNull();
  });

  it('clearAuthSession signs out locally', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await clearAuthSession();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('pure helpers', () => {
  it('supabaseProviderCallbackUrl derives the callback from the configured origin', () => {
    expect(supabaseProviderCallbackUrl()).toBe('https://p.supabase.co/auth/v1/callback');
  });
  it('supabaseOAuthErrorMessage reads query-param errors', () => {
    expect(
      supabaseOAuthErrorMessage('http://localhost:1420/connect?error=server_error&error_code=provider_error&error_description=Bad')
    ).toBe('Sign in failed: Bad (provider_error, server_error).');
  });
  it('supabaseOAuthErrorMessage returns null without an error', () => {
    expect(supabaseOAuthErrorMessage('http://localhost:1420/connect?code=abc')).toBeNull();
  });
});
