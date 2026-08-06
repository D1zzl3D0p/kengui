import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, KeyRound, Laptop, Server } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ProviderSignInButtons } from '../components/ProviderSignInButtons';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useConnectionStore, type ConnectionAuthMode, type ServerMode } from '../store/connection';
import { connectCurrentRuntime } from '../runtime/connectRuntime';
import {
  clearAuthSession,
  exchangeSupabaseCode,
  loadAuthSessionSummary,
  supabaseOAuthErrorMessage,
  type AuthSessionSummary,
  type SupabaseOAuthProvider,
} from '../auth/supabase';
import { beginSupabaseOAuth } from '../auth/oauthStart';
import { deepLinks } from '../platform';
import { normalizeHttpUrl, normalizeSupabaseBaseUrl } from '../lib/cloudUrls';

const HOSTED_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_HOSTED === 'true';
const LOCAL_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_LOCAL !== 'false';
const HOSTED_RUNTIME_URL =
  import.meta.env.VITE_KENGUI_HOSTED_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  'https://api.kengui.app';

const OAUTH_RETURN_MODE_KEY = 'kengui.oauth.returnMode';

function pendingOAuthMode(): ServerMode | null {
  if (typeof sessionStorage === 'undefined') return null;
  const mode = sessionStorage.getItem(OAUTH_RETURN_MODE_KEY);
  if (mode !== 'hosted' && mode !== 'external') return null;
  sessionStorage.removeItem(OAUTH_RETURN_MODE_KEY);
  return mode;
}

export default function Connecting() {
  const navigate = useNavigate();
  const {
    serverMode,
    serverUrl,
    authMode,
    connectionStatus,
    connectionError,
    setServerMode,
    setComputeTarget,
    setConnectionError,
  } = useConnectionStore();
  const [returnMode] = useState(pendingOAuthMode);
  const [selectedMode, setSelectedMode] = useState<ServerMode>(
    returnMode ?? (serverMode === 'local' && !LOCAL_RUNTIME_ENABLED ? 'external' : serverMode)
  );
  const [customUrl, setCustomUrl] = useState(
    serverMode === 'external' ? serverUrl : 'https://example.com'
  );
  const [customAuthMode, setCustomAuthMode] = useState<ConnectionAuthMode>(authMode);
  const [authSession, setAuthSession] = useState<AuthSessionSummary | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const requiresAuth = selectedMode === 'hosted' || customAuthMode === 'supabase';
  const canUseHosted = HOSTED_RUNTIME_ENABLED;
  const authReady = !requiresAuth || Boolean(authSession);
  const helperText = useMemo(() => {
    if (connectionStatus === 'not_found') {
      return 'Install kenkui locally or choose a hosted/custom server.';
    }
    if (connectionStatus === 'error') {
      return connectionError ?? 'Could not reach kenkui. Choose a runtime and try again.';
    }
    return 'Choose where audiobook conversions should run.';
  }, [connectionError, connectionStatus]);

  useEffect(() => {
    loadAuthSessionSummary().then(setAuthSession);
  }, []);

  useEffect(() => {
    const callbackUrl = window.location.href;
    const callbackError = supabaseOAuthErrorMessage(callbackUrl);
    if (callbackError) {
      setAuthMessage(callbackError);
      window.history.replaceState({}, '', '/connect');
      return;
    }
    if (!new URL(callbackUrl).searchParams.has('code')) return;
    exchangeSupabaseCode(callbackUrl)
      .then((session) => {
        setAuthSession({
          email: session.email,
          provider: session.provider,
          expiresAt: session.expiresAt,
        });
        window.history.replaceState({}, '', '/connect');
      })
      .catch((error) =>
        setAuthMessage(error instanceof Error ? error.message : 'Sign in failed.')
      );
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
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OAUTH_RETURN_MODE_KEY, selectedMode);
    }
    try {
      await beginSupabaseOAuth({
        provider,
        callbackMode: selectedMode === 'hosted' ? 'desktop' : 'browser',
      });
    } catch (error) {
      sessionStorage.removeItem(OAUTH_RETURN_MODE_KEY);
      setAuthMessage(error instanceof Error ? error.message : 'Could not start sign in.');
    }
  }

  async function signOut() {
    await clearAuthSession();
    setAuthSession(null);
  }

  async function connect(mode: ServerMode) {
    setConnecting(true);
    setConnectionError(null);
    try {
      const nextAuthMode =
        mode === 'hosted' ? 'supabase' : mode === 'external' ? customAuthMode : 'none';
      const nextUrl =
        mode === 'local'
          ? 'http://localhost:45365'
          : mode === 'hosted'
            ? normalizeSupabaseBaseUrl(HOSTED_RUNTIME_URL)
            : normalizeHttpUrl(customUrl, 'Server URL');
      if (nextAuthMode === 'supabase' && !authSession) {
        throw new Error('Sign in before connecting to this runtime.');
      }
      await setServerMode(mode, nextUrl, nextAuthMode);
      if (mode === 'hosted') {
        await setComputeTarget('kenkui-cloud');
      }
      await connectCurrentRuntime();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : 'Could not connect to kenkui.'
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2 border-b pb-5">
          <p className="text-sm font-medium text-primary">Kengui</p>
          <h1 className="text-3xl font-semibold">Connect to kenkui</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{helperText}</p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          {LOCAL_RUNTIME_ENABLED && (
            <button
              type="button"
              className={`rounded-lg border bg-card p-5 text-left shadow-sm transition-colors ${
                selectedMode === 'local' ? 'border-primary' : 'hover:border-primary/50'
              }`}
              onClick={() => setSelectedMode('local')}
            >
              <Laptop className="mb-4 size-6 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Local</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Start or attach to kenkui on this computer.
              </p>
            </button>
          )}

          <button
            type="button"
            className={`rounded-lg border bg-card p-5 text-left shadow-sm transition-colors ${
              selectedMode === 'hosted' ? 'border-primary' : 'hover:border-primary/50'
            } ${!canUseHosted ? 'opacity-55' : ''}`}
            disabled={!canUseHosted}
            onClick={() => setSelectedMode('hosted')}
          >
            <Cloud className="mb-4 size-6 text-primary" aria-hidden="true" />
            <h2 className="text-xl font-semibold">Kengui Cloud</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use hosted compute with your Kengui account.
            </p>
          </button>

          <button
            type="button"
            className={`rounded-lg border bg-card p-5 text-left shadow-sm transition-colors ${
              selectedMode === 'external' ? 'border-primary' : 'hover:border-primary/50'
            }`}
            onClick={() => setSelectedMode('external')}
          >
            <Server className="mb-4 size-6 text-primary" aria-hidden="true" />
            <h2 className="text-xl font-semibold">Custom server</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect to a self-hosted or public kenkui instance.
            </p>
          </button>
        </section>

        {selectedMode === 'external' && (
          <section className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="flex flex-col gap-2">
                <Label htmlFor="custom-url">Server URL</Label>
                <Input
                  id="custom-url"
                  type="url"
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                  placeholder="https://kenkui.example.com"
                />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={customAuthMode === 'supabase'}
                  onChange={(event) =>
                    setCustomAuthMode(event.target.checked ? 'supabase' : 'none')
                  }
                />
                Require account sign in
              </label>
            </div>
          </section>
        )}

        {selectedMode === 'hosted' && (
          <section className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-1">
              <Label>Hosted control plane</Label>
              <p className="break-all text-sm text-muted-foreground">{HOSTED_RUNTIME_URL}</p>
            </div>
          </section>
        )}

        {requiresAuth && (
          <section className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
                    <KeyRound className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Account</h2>
                    <p className="text-sm text-muted-foreground">
                      {authSession?.email
                        ? `Signed in as ${authSession.email}`
                        : 'Sign in with Google, GitHub, or Apple to use this runtime.'}
                    </p>
                  </div>
                </div>
                {authSession && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={signOut}>Sign out</Button>
                  </div>
                )}
              </div>
              {!authSession && (
                <ProviderSignInButtons onSelect={beginOAuth} disabled={connecting} />
              )}
            </div>
            {authMessage && <p className="mt-3 text-sm text-destructive">{authMessage}</p>}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => connect(selectedMode)}
            disabled={connecting || (requiresAuth && !authReady)}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
          {connectionError && (
            <p className="text-sm text-destructive">{connectionError}</p>
          )}
        </div>
      </div>
    </main>
  );
}
