import {
  createSupabaseOAuthUrl,
  supabaseConfigured,
  type SupabaseOAuthProvider,
} from './supabase';
import { authCallback, externalUrl } from '../platform';
import { isLocalhostUrl } from '../lib/cloudUrls';

export const LOCAL_HOSTED_AUTH_MESSAGE =
  'Local Kengui Cloud sign in requires the Tauri app. Launch with `rtk npm run tauri -- dev` and try again.';

export async function beginSupabaseOAuth(options: {
  provider: SupabaseOAuthProvider;
  supabaseBaseUrl?: string | undefined;
  requireNativeCallbackForLocalhost?: boolean;
}): Promise<void> {
  const { provider, supabaseBaseUrl, requireNativeCallbackForLocalhost = false } = options;
  if (!supabaseConfigured(supabaseBaseUrl)) {
    throw new Error('Supabase auth is not configured for this build.');
  }

  const redirectTo = await authCallback.prepareAuthRedirectUrl();
  if (
    !redirectTo &&
    requireNativeCallbackForLocalhost &&
    supabaseBaseUrl &&
    isLocalhostUrl(supabaseBaseUrl)
  ) {
    throw new Error(LOCAL_HOSTED_AUTH_MESSAGE);
  }

  await externalUrl.openExternalUrl(
    await createSupabaseOAuthUrl(provider, redirectTo ?? undefined, supabaseBaseUrl)
  );
}
