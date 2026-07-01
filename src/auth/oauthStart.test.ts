import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authCallback, externalUrl } from '../platform';
import { createSupabaseOAuthUrl, supabaseConfigured } from './supabase';
import { beginSupabaseOAuth, LOCAL_HOSTED_AUTH_MESSAGE } from './oauthStart';

vi.mock('../platform', () => ({
  authCallback: {
    prepareAuthRedirectUrl: vi.fn(),
  },
  externalUrl: {
    openExternalUrl: vi.fn(),
  },
}));

vi.mock('./supabase', () => ({
  createSupabaseOAuthUrl: vi.fn(),
  supabaseConfigured: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabaseConfigured).mockReturnValue(true);
  vi.mocked(createSupabaseOAuthUrl).mockResolvedValue('http://127.0.0.1:54321/auth/v1/authorize');
  vi.mocked(authCallback.prepareAuthRedirectUrl).mockResolvedValue('http://127.0.0.1:49152/auth/callback');
  vi.mocked(externalUrl.openExternalUrl).mockResolvedValue(undefined);
});

describe('beginSupabaseOAuth', () => {
  it('uses the native redirect and selected Supabase base URL', async () => {
    await beginSupabaseOAuth({
      provider: 'github',
      supabaseBaseUrl: 'http://127.0.0.1:54321',
      requireNativeCallbackForLocalhost: true,
    });

    expect(createSupabaseOAuthUrl).toHaveBeenCalledWith(
      'github',
      'http://127.0.0.1:49152/auth/callback',
      'http://127.0.0.1:54321'
    );
    expect(externalUrl.openExternalUrl).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/auth/v1/authorize'
    );
  });

  it('blocks localhost hosted OAuth when native callback is unavailable', async () => {
    vi.mocked(authCallback.prepareAuthRedirectUrl).mockResolvedValue(null);

    await expect(
      beginSupabaseOAuth({
        provider: 'github',
        supabaseBaseUrl: 'http://127.0.0.1:54321',
        requireNativeCallbackForLocalhost: true,
      })
    ).rejects.toThrow(LOCAL_HOSTED_AUTH_MESSAGE);

    expect(createSupabaseOAuthUrl).not.toHaveBeenCalled();
    expect(externalUrl.openExternalUrl).not.toHaveBeenCalled();
  });
});
