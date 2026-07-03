import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureStore } from '../platform';
import { useConnectionStore } from '../store/connection';
import {
  createSupabaseOAuthUrl,
  exchangeSupabaseCode,
  getAccessToken,
  supabaseOAuthErrorMessage,
  supabaseProviderCallbackUrl,
} from './supabase';

vi.mock('../platform', () => ({
  secureStore: {
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    clearSession: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://env-project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-key');
  sessionStorage.clear();
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    computeTarget: 'local',
    lastConnectedAt: null,
    connectionStatus: 'checking',
    connectionError: null,
  });
  vi.mocked(secureStore.loadSession).mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn());
});

describe('createSupabaseOAuthUrl', () => {
  it('builds a GitHub authorize URL with a native desktop redirect', async () => {
    const url = new URL(
      await createSupabaseOAuthUrl(
        'github',
        'http://127.0.0.1:49152/auth/callback',
        'http://127.0.0.1:54321/'
      )
    );

    expect(url.origin).toBe('http://127.0.0.1:54321');
    expect(url.pathname).toBe('/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('github');
    expect(url.searchParams.get('redirect_to')).toBe(
      'http://127.0.0.1:49152/auth/callback'
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(url.searchParams.has('state')).toBe(false);
  });

  it('falls back to the browser connect route only when no redirect is supplied', async () => {
    window.history.pushState({}, '', '/settings');

    const url = new URL(await createSupabaseOAuthUrl('github'));

    expect(url.origin).toBe('https://env-project.supabase.co');
    expect(url.searchParams.get('redirect_to')).toBe(`${window.location.origin}/connect`);
  });
});

describe('supabaseProviderCallbackUrl', () => {
  it('returns the GitHub provider callback URL for the selected Supabase base', () => {
    expect(supabaseProviderCallbackUrl('http://127.0.0.1:54321/')).toBe(
      'http://127.0.0.1:54321/auth/v1/callback'
    );
  });

  it('allows the provider callback URL to be overridden for custom Supabase auth origins', () => {
    vi.stubEnv('VITE_SUPABASE_PROVIDER_CALLBACK_URL', 'https://auth.example.test/auth/v1/callback/');

    expect(supabaseProviderCallbackUrl('http://127.0.0.1:54321/')).toBe(
      'https://auth.example.test/auth/v1/callback'
    );
  });

  it('uses the configured Supabase URL when no override is supplied', () => {
    expect(supabaseProviderCallbackUrl()).toBe(
      'https://env-project.supabase.co/auth/v1/callback'
    );
  });
});

describe('supabaseOAuthErrorMessage', () => {
  it('reads OAuth errors from query params', () => {
    expect(
      supabaseOAuthErrorMessage(
        'http://localhost:1420/connect?error=server_error&error_code=provider_error&error_description=Provider%20callback%20misconfigured'
      )
    ).toBe(
      'Sign in failed: Provider callback misconfigured (provider_error, server_error).'
    );
  });

  it('reads OAuth errors from hash fragments', () => {
    expect(
      supabaseOAuthErrorMessage(
        'http://localhost:1420/connect#error=access_denied&error_description=Access%20denied'
      )
    ).toBe('Sign in failed: Access denied (access_denied).');
  });

  it('returns null when the callback has no OAuth error', () => {
    expect(supabaseOAuthErrorMessage('http://localhost:1420/connect?code=abc')).toBeNull();
  });
});

describe('exchangeSupabaseCode', () => {
  it('fails with the Supabase OAuth error before attempting token exchange', async () => {
    await expect(
      exchangeSupabaseCode(
        'http://localhost:1420/connect#error=access_denied&error_description=Access%20denied'
      )
    ).rejects.toThrow('Sign in failed: Access denied (access_denied).');

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('getAccessToken', () => {
  it('returns a valid stored access token without refreshing', async () => {
    vi.mocked(secureStore.loadSession).mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      email: 'reader@example.com',
      provider: 'github',
    });

    await expect(getAccessToken()).resolves.toBe('valid-token');

    expect(fetch).not.toHaveBeenCalled();
    expect(secureStore.saveSession).not.toHaveBeenCalled();
  });

  it('refreshes an expired stored access token before returning it', async () => {
    const expiredSession = {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
      email: 'reader@example.com',
      provider: 'github',
    };
    vi.mocked(secureStore.loadSession)
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(expiredSession);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'fresh-token',
      refresh_token: 'fresh-refresh-token',
      expires_in: 3600,
      user: {
        email: 'reader@example.com',
        app_metadata: { provider: 'github' },
      },
    }), { status: 200 }));

    await expect(getAccessToken()).resolves.toBe('fresh-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://env-project.supabase.co/auth/v1/token?grant_type=refresh_token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh_token: 'refresh-token' }),
      })
    );
    expect(secureStore.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'fresh-token',
        refreshToken: 'fresh-refresh-token',
      })
    );
  });

  it('refreshes a near-expiry stored access token before returning it', async () => {
    const nearExpirySession = {
      accessToken: 'near-expiry-token',
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      email: 'reader@example.com',
      provider: 'github',
    };
    vi.mocked(secureStore.loadSession)
      .mockResolvedValueOnce(nearExpirySession)
      .mockResolvedValueOnce(nearExpirySession);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'fresh-token',
      refresh_token: 'fresh-refresh-token',
      expires_in: 3600,
      user: {},
    }), { status: 200 }));

    await expect(getAccessToken()).resolves.toBe('fresh-token');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clears the session and returns null when refresh fails', async () => {
    const expiredSession = {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
      email: 'reader@example.com',
      provider: 'github',
    };
    vi.mocked(secureStore.loadSession)
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(expiredSession);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('expired', { status: 401 }));

    await expect(getAccessToken()).resolves.toBeNull();

    expect(secureStore.clearSession).toHaveBeenCalled();
  });
});
