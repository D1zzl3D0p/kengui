import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureStore } from '../platform';
import { useConnectionStore } from '../store/connection';
import {
  createSupabaseOAuthUrl,
  exchangeSupabaseCode,
  supabaseOAuthErrorMessage,
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
    expect(url.searchParams.get('state')).toHaveLength(32);
  });

  it('falls back to the browser connect route only when no redirect is supplied', async () => {
    window.history.pushState({}, '', '/settings');

    const url = new URL(await createSupabaseOAuthUrl('github'));

    expect(url.origin).toBe('https://env-project.supabase.co');
    expect(url.searchParams.get('redirect_to')).toBe(`${window.location.origin}/connect`);
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
