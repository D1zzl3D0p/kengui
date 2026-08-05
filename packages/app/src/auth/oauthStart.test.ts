import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authCallback, externalUrl, isTauriRuntime } from '../platform';
import { startSupabaseOAuth, supabaseConfigured, supabaseProviderCallbackUrl } from './supabase';
import { beginSupabaseOAuth, LOCAL_HOSTED_AUTH_MESSAGE } from './oauthStart';

vi.mock('../platform', () => ({
  authCallback: {
    prepareAuthRedirectUrl: vi.fn(),
  },
  externalUrl: {
    openExternalUrl: vi.fn(),
  },
  isTauriRuntime: vi.fn(),
}));

vi.mock('./supabase', () => ({
  startSupabaseOAuth: vi.fn(),
  supabaseConfigured: vi.fn(),
  supabaseProviderCallbackUrl: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabaseConfigured).mockReturnValue(true);
  vi.mocked(supabaseProviderCallbackUrl).mockReturnValue('http://127.0.0.1:54321/auth/v1/callback');
  vi.mocked(startSupabaseOAuth).mockResolvedValue('http://127.0.0.1:54321/auth/v1/authorize');
  vi.mocked(authCallback.prepareAuthRedirectUrl).mockResolvedValue('http://127.0.0.1:49152/auth/callback');
  vi.mocked(externalUrl.openExternalUrl).mockResolvedValue(undefined);
  vi.mocked(isTauriRuntime).mockReturnValue(true);
});

describe('beginSupabaseOAuth', () => {
  it('uses the native desktop redirect and opens the returned URL', async () => {
    await beginSupabaseOAuth({ provider: 'github', callbackMode: 'desktop' });

    expect(startSupabaseOAuth).toHaveBeenCalledWith('github', 'http://127.0.0.1:49152/auth/callback');
    expect(externalUrl.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:54321/auth/v1/authorize');
  });

  it('blocks desktop OAuth when the native callback is unavailable inside Tauri', async () => {
    vi.mocked(authCallback.prepareAuthRedirectUrl).mockResolvedValue(null);

    await expect(
      beginSupabaseOAuth({ provider: 'github', callbackMode: 'desktop' })
    ).rejects.toThrow(LOCAL_HOSTED_AUTH_MESSAGE);

    expect(startSupabaseOAuth).not.toHaveBeenCalled();
    expect(externalUrl.openExternalUrl).not.toHaveBeenCalled();
  });

  it('downgrades desktop OAuth to the browser flow when not running in Tauri', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);

    await beginSupabaseOAuth({ provider: 'github', callbackMode: 'desktop' });

    expect(authCallback.prepareAuthRedirectUrl).not.toHaveBeenCalled();
    expect(startSupabaseOAuth).toHaveBeenCalledWith('github', undefined);
    expect(externalUrl.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:54321/auth/v1/authorize');
  });

  it('allows browser OAuth fallback without a native redirect', async () => {
    await beginSupabaseOAuth({ provider: 'github', callbackMode: 'browser' });

    expect(authCallback.prepareAuthRedirectUrl).not.toHaveBeenCalled();
    expect(startSupabaseOAuth).toHaveBeenCalledWith('github', undefined);
    expect(externalUrl.openExternalUrl).toHaveBeenCalledWith('http://127.0.0.1:54321/auth/v1/authorize');
  });

  it('throws when Supabase auth is not configured', async () => {
    vi.mocked(supabaseConfigured).mockReturnValue(false);

    await expect(
      beginSupabaseOAuth({ provider: 'github', callbackMode: 'browser' })
    ).rejects.toThrow('Supabase auth is not configured for this build.');
    expect(startSupabaseOAuth).not.toHaveBeenCalled();
  });
});
