import {
  startSupabaseOAuth,
  supabaseConfigured,
  supabaseProviderCallbackUrl,
  type SupabaseOAuthProvider,
} from './supabase';
import { authCallback, externalUrl, isTauriRuntime } from '../platform';

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

  // The native loopback callback only exists in the Tauri desktop webview. On the
  // hosted web build fall back to the browser redirect flow (Supabase returns to
  // `${origin}/connect`) instead of demanding the desktop app.
  const effectiveMode = callbackMode === 'desktop' && !isTauriRuntime() ? 'browser' : callbackMode;

  const redirectTo =
    effectiveMode === 'desktop' ? await authCallback.prepareAuthRedirectUrl() : null;
  if (!redirectTo && effectiveMode === 'desktop') {
    throw new Error(LOCAL_HOSTED_AUTH_MESSAGE);
  }

  const oauthUrl = await startSupabaseOAuth(provider, redirectTo ?? undefined);
  if (import.meta.env.DEV) {
    console.debug('Starting Supabase OAuth', {
      provider,
      supabaseOrigin: new URL(oauthUrl).origin,
      providerCallbackUrl: supabaseProviderCallbackUrl(),
      callbackMode: effectiveMode,
    });
  }
  await externalUrl.openExternalUrl(oauthUrl);
}
