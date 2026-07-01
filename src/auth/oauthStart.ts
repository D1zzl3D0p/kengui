import {
  createSupabaseOAuthUrl,
  supabaseConfigured,
  type SupabaseOAuthProvider,
} from './supabase';
import { authCallback, externalUrl } from '../platform';

export const LOCAL_HOSTED_AUTH_MESSAGE =
  'Local Kengui Cloud sign in requires the Tauri app. Launch with `rtk npm run tauri -- dev` and try again.';

export type OAuthCallbackMode = 'browser' | 'desktop';

export async function beginSupabaseOAuth(options: {
  provider: SupabaseOAuthProvider;
  supabaseBaseUrl?: string | undefined;
  callbackMode?: OAuthCallbackMode;
  requireNativeCallbackForLocalhost?: boolean;
}): Promise<void> {
  const {
    provider,
    supabaseBaseUrl,
    callbackMode = options.requireNativeCallbackForLocalhost ? 'desktop' : 'browser',
  } = options;
  if (!supabaseConfigured(supabaseBaseUrl)) {
    throw new Error('Supabase auth is not configured for this build.');
  }

  const redirectTo =
    callbackMode === 'desktop' ? await authCallback.prepareAuthRedirectUrl() : null;
  if (!redirectTo && callbackMode === 'desktop') {
    throw new Error(LOCAL_HOSTED_AUTH_MESSAGE);
  }

  const oauthUrl = await createSupabaseOAuthUrl(provider, redirectTo ?? undefined, supabaseBaseUrl);
  if (import.meta.env.DEV) {
    const parsed = new URL(oauthUrl);
    console.debug('Starting Supabase OAuth', {
      provider,
      supabaseOrigin: parsed.origin,
      callbackMode,
      redirectTo: parsed.searchParams.get('redirect_to') ?? 'browser-origin',
    });
  }
  await externalUrl.openExternalUrl(oauthUrl);
}
