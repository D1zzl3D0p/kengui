import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureStore } from '../platform';
import { useConnectionStore } from '../store/connection';
import {
  createSupabaseOAuthUrl,
  exchangeSupabaseCode,
  getAccessToken,
  refreshSupabaseSession,
  supabaseConfigured,
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
  it('uses the configured Supabase auth origin instead of the hosted runtime URL', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://auth-project.supabase.co');
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'https://runtime.example.test',
    });

    const url = new URL(await createSupabaseOAuthUrl('github'));

    expect(url.origin).toBe('https://auth-project.supabase.co');
    expect(url.href).not.toContain('runtime.example.test');
  });

  it('fails safely when the Supabase auth origin is missing in hosted mode', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'https://runtime.example.test',
    });

    expect(supabaseConfigured()).toBe(false);
    await expect(createSupabaseOAuthUrl('github')).rejects.toThrow(
      'Supabase URL is not configured.'
    );
  });

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
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
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
  it('uses the exact auth origin stored when the authorize flow started', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: {},
    }), { status: 200 }));
    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'https://authorize-origin.example.test/'
    );
    vi.stubEnv('VITE_SUPABASE_URL', 'https://changed-auth.example.test');
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'https://runtime.example.test',
    });

    await exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code');

    expect(fetch).toHaveBeenCalledWith(
      'https://authorize-origin.example.test/auth/v1/token?grant_type=pkce',
      expect.any(Object)
    );
  });

  it('fails with the Supabase OAuth error before attempting token exchange', async () => {
    await expect(
      exchangeSupabaseCode(
        'http://localhost:1420/connect#error=access_denied&error_description=Access%20denied'
      )
    ).rejects.toThrow('Sign in failed: Access denied (access_denied).');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges the PKCE code with Supabase auth headers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: {
        email: 'reader@example.com',
        app_metadata: { provider: 'github' },
      },
    }), { status: 200 }));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321/'
    );
    const expectedVerifier = sessionStorage.getItem('kengui.pkce.verifier');

    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'reader@example.com',
      provider: 'github',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/auth/v1/token?grant_type=pkce',
      expect.objectContaining({
        method: 'POST',
        headers: {
          apikey: 'publishable-key',
          Authorization: 'Bearer publishable-key',
          'Content-Type': 'application/json',
        },
      })
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      auth_code: 'oauth-code',
      code_verifier: expectedVerifier,
    });
    expect(secureStore.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-token' })
    );
  });

  it('includes the Supabase token error description when PKCE exchange fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error: 'invalid_grant',
      error_description: 'invalid code challenge method',
    }), { status: 401 }));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321/'
    );

    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).rejects.toThrow('Supabase token exchange failed with 401: invalid code challenge method');
  });

  it('includes Supabase token message and error code fields when PKCE exchange fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      error_code: 'bad_jwt',
      message: 'missing sub claim',
    }), { status: 401 }));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321/'
    );

    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).rejects.toThrow('Supabase token exchange failed with 401: missing sub claim (bad_jwt)');
  });

  it.each([
    [{ msg: 'flow state not found', code: 'flow_state_not_found' }, 'flow state not found (flow_state_not_found)'],
    [{ error: 'invalid_grant' }, 'invalid_grant'],
    [{ code: 'flow_state_not_found' }, 'Supabase token exchange failed with 400 (flow_state_not_found)'],
  ])('safely labels additional Supabase token error fields from %j', async (body, expected) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 400 }));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321/'
    );

    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).rejects.toThrow(expected);
  });

  it('does not surface a non-JSON token response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      'upstream secret diagnostic that must not be shown',
      { status: 502, headers: { 'Content-Type': 'text/plain' } }
    ));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321/'
    );

    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).rejects.toThrow('Supabase token exchange failed with 502.');
  });
});

describe('refreshSupabaseSession', () => {
  it('refreshes an explicitly selected auth origin and preserves it in the refreshed session', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'exchanged-access-token',
        refresh_token: 'exchanged-refresh-token',
        expires_in: 3600,
        user: {},
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
        expires_in: 3600,
        user: {},
      }), { status: 200 }));

    await createSupabaseOAuthUrl(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'https://custom-auth.example.test/'
    );
    const exchanged = await exchangeSupabaseCode(
      'http://127.0.0.1:49152/auth/callback?code=oauth-code'
    );
    const savedAfterExchange = vi.mocked(secureStore.saveSession).mock.calls[0]?.[0];
    expect(savedAfterExchange).toEqual(exchanged);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://different-project.supabase.co');
    vi.mocked(secureStore.loadSession).mockResolvedValue(savedAfterExchange!);

    const refreshed = await refreshSupabaseSession();

    expect(exchanged.authOrigin).toBe('https://custom-auth.example.test');
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://custom-auth.example.test/auth/v1/token?grant_type=refresh_token',
      expect.any(Object)
    );
    expect(refreshed).toMatchObject({
      accessToken: 'refreshed-access-token',
      authOrigin: 'https://custom-auth.example.test',
    });
    expect(secureStore.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ authOrigin: 'https://custom-auth.example.test' })
    );
  });

  it('falls back to VITE_SUPABASE_URL for a legacy session without an auth origin', async () => {
    vi.mocked(secureStore.loadSession).mockResolvedValue({
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      expiresAt: 0,
      email: null,
      provider: null,
    });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://legacy-project.supabase.co/');
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'refreshed-access-token',
      refresh_token: 'refreshed-refresh-token',
      expires_in: 3600,
      user: {},
    }), { status: 200 }));

    const refreshed = await refreshSupabaseSession();

    expect(fetch).toHaveBeenCalledWith(
      'https://legacy-project.supabase.co/auth/v1/token?grant_type=refresh_token',
      expect.any(Object)
    );
    expect(refreshed?.authOrigin).toBe('https://legacy-project.supabase.co');
  });

  it('fails before fetch without a persisted or configured auth origin', async () => {
    vi.mocked(secureStore.loadSession).mockResolvedValue({
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      expiresAt: 0,
      email: null,
      provider: null,
    });
    vi.stubEnv('VITE_SUPABASE_URL', '');

    await expect(refreshSupabaseSession()).rejects.toThrow(
      'Supabase URL is not configured.'
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(secureStore.clearSession).not.toHaveBeenCalled();
  });
});

describe('getAccessToken', () => {
  it('refreshes against the configured auth origin in hosted mode, not the runtime URL', async () => {
    const expiredSession = {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: 0,
      email: null,
      provider: null,
    };
    vi.mocked(secureStore.loadSession)
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(expiredSession);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'fresh-token',
      refresh_token: 'fresh-refresh-token',
      expires_in: 3600,
      user: {},
    }), { status: 200 }));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://auth-project.supabase.co');
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'https://runtime.example.test',
    });

    await expect(getAccessToken()).resolves.toBe('fresh-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://auth-project.supabase.co/auth/v1/token?grant_type=refresh_token',
      expect.any(Object)
    );
  });

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
        headers: {
          apikey: 'publishable-key',
          Authorization: 'Bearer publishable-key',
          'Content-Type': 'application/json',
        },
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
