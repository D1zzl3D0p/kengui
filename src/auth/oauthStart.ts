import {
  startSupabaseOAuth,
  supabaseConfigured,
  supabaseProviderCallbackUrl,
  type SupabaseOAuthProvider,
} from './supabase';
import { authCallback, externalUrl } from '../platform';

export const LOCAL_HOSTED_AUTH_MESSAGE =
  'Local Kengui Cloud sign in requires the Tauri app. Launch with `rtk npm run tauri -- dev` and try again.';

export type OAuthCallbackMode = 'browser' | 'desktop';

export async function beginSupabaseOAuth(options: {
  provider: SupabaseOAuthProvider;
  callbackMode?: OAuthCallbackMode;
  requireNativeCallbackForLocalhost?: boolean;
}): Promise<void> {
  const {
    provider,
    callbackMode = options.requireNativeCallbackForLocalhost ? 'desktop' : 'browser',
  } = options;
  if (!supabaseConfigured()) {
    throw new Error('Supabase auth is not configured for this build.');
  }

  const redirectTo =
    callbackMode === 'desktop' ? await authCallback.prepareAuthRedirectUrl() : null;
  if (!redirectTo && callbackMode === 'desktop') {
    throw new Error(LOCAL_HOSTED_AUTH_MESSAGE);
  }

  const oauthUrl = await startSupabaseOAuth(provider, redirectTo ?? undefined);
  if (import.meta.env.DEV) {
    console.debug('Starting Supabase OAuth', {
      provider,
      supabaseOrigin: new URL(oauthUrl).origin,
      providerCallbackUrl: supabaseProviderCallbackUrl(),
      callbackMode,
    });
  }
  await externalUrl.openExternalUrl(oauthUrl);
}
