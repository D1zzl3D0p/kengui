import { useEffect, useState } from 'react';
import { KeyRound, LogIn, LogOut } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { ComputeTarget } from '../../store/connection';
import {
  clearAuthSession,
  exchangeSupabaseCode,
  loadAuthSessionSummary,
  type AuthSessionSummary,
  type SupabaseOAuthProvider,
} from '../../auth/supabase';
import { beginSupabaseOAuth } from '../../auth/oauthStart';
import { deepLinks } from '../../platform';
import { CLOUD_AUTH_PROVIDERS } from './constants';

interface Props {
  localComputeTarget: ComputeTarget;
}

export function AccountSettings({ localComputeTarget }: Props) {
  const [authSession, setAuthSession] = useState<AuthSessionSummary | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    loadAuthSessionSummary().then(setAuthSession);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlistenAuthCallback: (() => void) | null = null;
    deepLinks.onAuthCallback((url) => {
      if (cancelled) return;
      exchangeSupabaseCode(url)
        .then((session) => {
          if (cancelled) return;
          setAuthSession({
            email: session.email,
            provider: session.provider,
            expiresAt: session.expiresAt,
          });
          setAuthMessage('Signed in to Kengui Cloud.');
        })
        .catch((error) => {
          if (!cancelled) {
            setAuthMessage(error instanceof Error ? error.message : 'Sign in failed.');
          }
        });
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenAuthCallback = unlisten;
      }
    });
    return () => {
      cancelled = true;
      unlistenAuthCallback?.();
    };
  }, []);

  async function beginOAuth(provider: SupabaseOAuthProvider) {
    setAuthMessage(null);
    setAuthLoading(true);
    try {
      await beginSupabaseOAuth({
        provider,
        callbackMode: 'desktop',
      });
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Could not start sign in.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      await clearAuthSession();
      setAuthSession(null);
      setAuthMessage('Signed out of Kengui Cloud.');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Sign out failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <KeyRound className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Cloud Account</h2>
          <p className="text-sm text-muted-foreground">
            Sign in before submitting jobs to Kengui Cloud compute.
          </p>
        </div>
      </div>

      {authSession ? (
        <div className="flex flex-col gap-3 rounded-md border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {authSession.email ?? 'Signed in to Kengui Cloud'}
            </p>
            <p className="text-xs text-muted-foreground">
              {authSession.provider ? `Provider: ${authSession.provider}` : 'Account session is stored securely.'}
            </p>
          </div>
          <Button variant="outline" className="w-fit" onClick={signOut} disabled={authLoading}>
            <LogOut aria-hidden="true" />
            {authLoading ? 'Signing out...' : 'Sign out'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {localComputeTarget === 'kenkui-cloud' && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sign in before cloud submission. Local preview, voices, logs, and runtime settings still use your configured kenkui server.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {CLOUD_AUTH_PROVIDERS.map(({ provider, label }) => (
              <Button
                key={provider}
                variant="outline"
                onClick={() => beginOAuth(provider)}
                disabled={authLoading}
              >
                <LogIn aria-hidden="true" />
                Continue with {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {authMessage && (
        <p className="rounded-md border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
          {authMessage}
        </p>
      )}
    </section>
  );
}
