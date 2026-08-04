# Cloud Auth: supabase-js Migration + Fixed Hosted Project — Implementation Plan

> Historical layout note: this completed plan predates the monorepo migration.
> Paths beginning with `src/` now live under `packages/app/src/`, and
> `src-tauri/` now lives under `apps/desktop/src-tauri/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Kengui's hand-rolled Supabase PKCE auth with `@supabase/supabase-js`, fix the missing `apikey` header on cloud calls, and lock "Kengui Cloud" to a single fixed hosted project so auth and runtime origins can never diverge.

**Architecture:** A generic keychain-backed key-value adapter (`secureKv`) backs a single memoized supabase-js client (`supabaseClient.ts`). `auth/supabase.ts` keeps its entire public export surface but delegates to the client. The hosted-URL UI field becomes read-only, driven by build-time env.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + @testing-library, Tauri v2 (Rust), `@supabase/supabase-js` v2, Zustand.

## Global Constraints

- Preserve the **full public API** of `src/auth/supabase.ts`: `supabaseConfigured`, `supabaseProviderCallbackUrl`, `supabaseOAuthErrorMessage`, `exchangeSupabaseCode`, `loadAuthSessionSummary`, `getAccessToken`, `refreshSupabaseSession`, `clearAuthSession`, plus types `AuthSessionSummary` and `SupabaseOAuthProvider`. Three files depend on `refreshSupabaseSession` (`api/client.ts`, `api/cloudClient.ts`, `runtime/runtime.ts`) — it MUST remain exported.
- supabase-js auth config is always: `flowType: 'pkce'`, `detectSessionInUrl: false`, `autoRefreshToken: true`, `persistSession: true`, `storage: secureKv`.
- Secure token storage stays in the **macOS Keychain** via the existing Tauri command slot; localStorage is the non-macOS/web fallback only.
- Single fixed hosted project: no runtime-entered Supabase URL or anon key.
- TDD: failing test first, minimal impl, commit per task. Gate each TS task with the relevant `vitest` run; gate the Rust task with `npm run check:rust`.
- Do not change GitHub OAuth callback config or `.github/workflows/desktop-cloud-build.yml` var wiring.

---

## File Structure

- `src-tauri/src/lib.rs` — auth commands store/return an opaque `String` (drop `AuthSession` struct).
- `src/platform/secureStore.ts` — replace session-shaped store with `secureKv` KV adapter.
- `src/platform/index.ts` — export `secureKv` / `SecureKvStorage`; drop `secureStore`/`StoredAuthSession`/`SecureSessionStore`.
- `src/auth/supabaseClient.ts` (new) — client factory + config helpers.
- `src/auth/supabase.ts` — rewrite internals; same exports; add `startSupabaseOAuth`.
- `src/auth/oauthStart.ts` — call `startSupabaseOAuth`; drop `supabaseBaseUrl` option.
- `src/api/cloudClient.ts` — add `apikey` header.
- `src/pages/Connecting.tsx` — read-only hosted URL, constant-driven `connect('hosted')`.
- `src/pages/Settings/AccountSettings.tsx` — drop `supabaseBaseUrl` from `beginSupabaseOAuth` call.
- Tests: `src/platform/secureStore.test.ts` (new), `src/auth/supabaseClient.test.ts` (new), `src/auth/supabase.test.ts` (rewrite), `src/api/cloudClient.test.ts` (new), `src/pages/Connecting.test.tsx` (new or extend).
- Docs: `docs/cloud-auth.md`, `.env.example`.

---

### Task 1: Rust — opaque-string secure storage commands

**Files:**
- Modify: `src-tauri/src/lib.rs` (the `AuthSession` struct + `save_auth_session`/`load_auth_session` commands near lines 939–954)

**Interfaces:**
- Produces (Tauri commands): `save_auth_session(value: String) -> Result<(), AppError>`, `load_auth_session() -> Result<Option<String>, AppError>`, `clear_auth_session() -> Result<(), AppError>`.

- [ ] **Step 1: Find and read the current commands**

Run: `grep -n "AuthSession\|save_auth_session\|load_auth_session\|clear_auth_session" src-tauri/src/lib.rs`
Read the `AuthSession` struct definition and the three command fns (around lines 939–959).

- [ ] **Step 2: Replace the typed commands with opaque-string commands**

Replace the `save_auth_session` and `load_auth_session` command bodies (keep `clear_auth_session` as-is):

```rust
#[tauri::command]
async fn save_auth_session(value: String) -> Result<(), AppError> {
    write_auth_session(&value)
}

#[tauri::command]
async fn load_auth_session() -> Result<Option<String>, AppError> {
    read_auth_session()
}
```

Then delete the now-unused `AuthSession` struct definition. Leave `write_auth_session`/`read_auth_session`/`delete_auth_session` (they already operate on strings) and the `invoke_handler` registrations unchanged.

- [ ] **Step 3: Verify the crate compiles**

Run: `npm run check:rust`
Expected: PASS (no errors; if `AuthSession` is referenced elsewhere, remove those references — it should only be used by the two commands).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor(tauri): store auth session as opaque string for supabase-js"
```

---

### Task 2: `secureKv` keychain-backed KV adapter

**Files:**
- Modify: `src/platform/secureStore.ts` (full rewrite)
- Modify: `src/platform/index.ts` (line 7 export)
- Test: `src/platform/secureStore.test.ts` (new)

**Interfaces:**
- Consumes (Task 1): Tauri commands `load_auth_session` → `string | null`, `save_auth_session({ value })`, `clear_auth_session`.
- Produces: `export const secureKv: SecureKvStorage` and `export interface SecureKvStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>; }`

- [ ] **Step 1: Write the failing tests**

Create `src/platform/secureStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

async function freshKv() {
  vi.resetModules();
  return (await import('./secureStore')).secureKv;
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe('secureKv', () => {
  it('hydrates from the keychain blob and reads a key', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'load_auth_session' ? Promise.resolve(JSON.stringify({ a: '1' })) : Promise.resolve());
    const kv = await freshKv();
    await expect(kv.getItem('a')).resolves.toBe('1');
    await expect(kv.getItem('missing')).resolves.toBeNull();
  });

  it('persists the whole map as JSON on setItem', async () => {
    invoke.mockResolvedValue(null);
    const kv = await freshKv();
    await kv.setItem('token', 'xyz');
    expect(invoke).toHaveBeenCalledWith('save_auth_session', { value: JSON.stringify({ token: 'xyz' }) });
  });

  it('clears the slot when the last key is removed', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'load_auth_session' ? Promise.resolve(JSON.stringify({ token: 'xyz' })) : Promise.resolve());
    const kv = await freshKv();
    await kv.removeItem('token');
    expect(invoke).toHaveBeenCalledWith('clear_auth_session');
  });

  it('falls back to localStorage when invoke rejects', async () => {
    invoke.mockRejectedValue(new Error('no tauri'));
    const kv = await freshKv();
    await kv.setItem('token', 'abc');
    expect(localStorage.getItem('kengui.supabase.session')).toBe(JSON.stringify({ token: 'abc' }));
    const kv2 = await freshKv();
    await expect(kv2.getItem('token')).resolves.toBe('abc');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/platform/secureStore.test.ts`
Expected: FAIL (`secureKv` not exported / old session API present).

- [ ] **Step 3: Rewrite `src/platform/secureStore.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';

const STORAGE_SLOT_KEY = 'kengui.supabase.session';

export interface SecureKvStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let cache: Record<string, string> | null = null;
let hydration: Promise<Record<string, string>> | null = null;

async function readBlob(): Promise<string | null> {
  try {
    return await invoke<string | null>('load_auth_session');
  } catch {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_SLOT_KEY);
  }
}

async function writeBlob(value: string): Promise<void> {
  try {
    await invoke('save_auth_session', { value });
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_SLOT_KEY, value);
  }
}

async function clearBlob(): Promise<void> {
  try {
    await invoke('clear_auth_session');
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_SLOT_KEY);
  }
}

async function hydrate(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!hydration) {
    hydration = (async () => {
      const raw = await readBlob();
      try {
        cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        cache = {};
      }
      return cache;
    })();
  }
  return hydration;
}

async function persist(map: Record<string, string>): Promise<void> {
  if (Object.keys(map).length === 0) await clearBlob();
  else await writeBlob(JSON.stringify(map));
}

export const secureKv: SecureKvStorage = {
  async getItem(key) {
    const map = await hydrate();
    return key in map ? map[key] : null;
  },
  async setItem(key, value) {
    const map = await hydrate();
    map[key] = value;
    await persist(map);
  },
  async removeItem(key) {
    const map = await hydrate();
    if (key in map) {
      delete map[key];
      await persist(map);
    }
  },
};
```

- [ ] **Step 4: Update the platform barrel export**

In `src/platform/index.ts` replace line 7:

```ts
export { secureKv, type SecureKvStorage } from './secureStore';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/platform/secureStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/platform/secureStore.ts src/platform/index.ts src/platform/secureStore.test.ts
git commit -m "feat(platform): keychain-backed secureKv key-value adapter"
```

---

### Task 3: supabase-js client factory

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/auth/supabaseClient.ts`
- Test: `src/auth/supabaseClient.test.ts` (new)

**Interfaces:**
- Consumes (Task 2): `secureKv` from `../platform`.
- Produces: `supabaseConfigured(): boolean`, `getSupabaseClient(): SupabaseClient` (throws `'Supabase URL is not configured.'` when unset), `supabaseAnonKey(): string`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @supabase/supabase-js`
Expected: `@supabase/supabase-js` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing tests**

Create `src/auth/supabaseClient.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn(() => ({ auth: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
vi.mock('../platform', () => ({ secureKv: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }));

async function fresh() {
  vi.resetModules();
  return import('./supabaseClient');
}

beforeEach(() => {
  createClient.mockClear();
  vi.unstubAllEnvs();
});

describe('supabaseClient', () => {
  it('reports configured only when URL and key are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const m = await fresh();
    expect(m.supabaseConfigured()).toBe(true);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m2 = await fresh();
    expect(m2.supabaseConfigured()).toBe(false);
  });

  it('throws when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m = await fresh();
    expect(() => m.getSupabaseClient()).toThrow('Supabase URL is not configured.');
  });

  it('creates a memoized PKCE client with secureKv storage', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const m = await fresh();
    const c1 = m.getSupabaseClient();
    const c2 = m.getSupabaseClient();
    expect(c1).toBe(c2);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://p.supabase.co', 'anon', expect.objectContaining({
      auth: expect.objectContaining({ flowType: 'pkce', detectSessionInUrl: false, persistSession: true }),
    }));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/auth/supabaseClient.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Create `src/auth/supabaseClient.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureKv } from '../platform';

let client: SupabaseClient | null = null;

function envUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return url ? url.replace(/\/$/, '') : null;
}

export function supabaseConfigured(): boolean {
  return Boolean(envUrl() && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function supabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Supabase anon key is not configured.');
  return key;
}

export function getSupabaseClient(): SupabaseClient {
  const url = envUrl();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL is not configured.');
  if (!client) {
    client = createClient(url, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
        storage: secureKv,
      },
    });
  }
  return client;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/auth/supabaseClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/auth/supabaseClient.ts src/auth/supabaseClient.test.ts
git commit -m "feat(auth): add memoized supabase-js client factory"
```

---

### Task 4: Rewrite `auth/supabase.ts` + `oauthStart.ts`

**Files:**
- Modify: `src/auth/supabase.ts` (rewrite internals; keep exports; add `startSupabaseOAuth`)
- Modify: `src/auth/oauthStart.ts`
- Modify: `src/pages/Settings/AccountSettings.tsx` (drop `supabaseBaseUrl` field from the `beginSupabaseOAuth` call at line ~66)
- Test: `src/auth/supabase.test.ts` (rewrite)

**Interfaces:**
- Consumes (Task 3): `getSupabaseClient`, `supabaseConfigured`, `supabaseAnonKey`.
- Produces: unchanged public exports (see Global Constraints) with `exchangeSupabaseCode`, `loadAuthSessionSummary`, `refreshSupabaseSession` now returning `AuthSessionSummary` / `AuthSessionSummary | null`; new `startSupabaseOAuth(provider: SupabaseOAuthProvider, redirectTo?: string): Promise<string>`.

- [ ] **Step 1: Rewrite the test file**

Replace `src/auth/supabase.test.ts` entirely:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('./supabaseClient', () => ({
  supabaseConfigured: vi.fn(() => true),
  supabaseAnonKey: vi.fn(() => 'anon-key'),
  getSupabaseClient: vi.fn(() => ({ auth })),
}));

import {
  clearAuthSession,
  exchangeSupabaseCode,
  getAccessToken,
  loadAuthSessionSummary,
  refreshSupabaseSession,
  startSupabaseOAuth,
  supabaseOAuthErrorMessage,
  supabaseProviderCallbackUrl,
} from './supabase';

const sessionFixture = {
  access_token: 'access-token',
  expires_at: 1983812996,
  user: { email: 'reader@example.com', app_metadata: { provider: 'github' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});

describe('startSupabaseOAuth', () => {
  it('returns the provider URL and passes redirectTo without browser redirect', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://p.supabase.co/authorize?x=1' }, error: null });
    const url = await startSupabaseOAuth('github', 'http://127.0.0.1:49152/auth/callback');
    expect(url).toBe('https://p.supabase.co/authorize?x=1');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: 'http://127.0.0.1:49152/auth/callback', skipBrowserRedirect: true },
    });
  });

  it('throws when supabase returns an error', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'nope' } });
    await expect(startSupabaseOAuth('github', 'http://127.0.0.1:49152/auth/callback')).rejects.toThrow('nope');
  });
});

describe('exchangeSupabaseCode', () => {
  it('surfaces an OAuth callback error before exchanging', async () => {
    await expect(
      exchangeSupabaseCode('http://localhost:1420/connect#error=access_denied&error_description=Access%20denied')
    ).rejects.toThrow('Sign in failed: Access denied (access_denied).');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('exchanges the code and returns a session summary', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: sessionFixture }, error: null });
    await expect(
      exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback?code=oauth-code')
    ).resolves.toEqual({ email: 'reader@example.com', provider: 'github', expiresAt: 1983812996 });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
  });

  it('throws when no code is present', async () => {
    await expect(exchangeSupabaseCode('http://127.0.0.1:49152/auth/callback')).rejects.toThrow(
      'Could not complete sign in. Start the login again.'
    );
  });
});

describe('session accessors', () => {
  it('getAccessToken returns the current session token', async () => {
    auth.getSession.mockResolvedValue({ data: { session: sessionFixture } });
    await expect(getAccessToken()).resolves.toBe('access-token');
  });

  it('getAccessToken returns null with no session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(getAccessToken()).resolves.toBeNull();
  });

  it('loadAuthSessionSummary maps the stored session', async () => {
    auth.getSession.mockResolvedValue({ data: { session: sessionFixture } });
    await expect(loadAuthSessionSummary()).resolves.toEqual({
      email: 'reader@example.com', provider: 'github', expiresAt: 1983812996,
    });
  });

  it('refreshSupabaseSession returns null on error', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'x' } });
    await expect(refreshSupabaseSession()).resolves.toBeNull();
  });

  it('clearAuthSession signs out locally', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await clearAuthSession();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('pure helpers', () => {
  it('supabaseProviderCallbackUrl derives the callback from the configured origin', () => {
    expect(supabaseProviderCallbackUrl()).toBe('https://p.supabase.co/auth/v1/callback');
  });
  it('supabaseOAuthErrorMessage reads query-param errors', () => {
    expect(
      supabaseOAuthErrorMessage('http://localhost:1420/connect?error=server_error&error_code=provider_error&error_description=Bad')
    ).toBe('Sign in failed: Bad (provider_error, server_error).');
  });
  it('supabaseOAuthErrorMessage returns null without an error', () => {
    expect(supabaseOAuthErrorMessage('http://localhost:1420/connect?code=abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/auth/supabase.test.ts`
Expected: FAIL (`startSupabaseOAuth` missing; old fetch-based impl mismatches).

- [ ] **Step 3: Rewrite `src/auth/supabase.ts`**

Keep the existing `callbackParamGroups`, `firstCallbackParam`, `supabaseOAuthErrorMessage`, and `redirectUrl` helpers verbatim from the current file. Replace everything else with:

```ts
import { getSupabaseClient, supabaseConfigured } from './supabaseClient';

export interface AuthSessionSummary {
  email: string | null;
  provider: string | null;
  expiresAt: number;
}

export type SupabaseOAuthProvider = 'google' | 'github' | 'apple';

export { supabaseConfigured };

// --- keep callbackParamGroups / firstCallbackParam / supabaseOAuthErrorMessage / redirectUrl unchanged ---

export function supabaseProviderCallbackUrl(): string {
  const override = import.meta.env.VITE_SUPABASE_PROVIDER_CALLBACK_URL;
  if (override) return override.replace(/\/$/, '');
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Supabase URL is not configured.');
  return `${new URL(url).origin}/auth/v1/callback`;
}

function summarize(session: any): AuthSessionSummary {
  const provider = session?.user?.app_metadata?.provider;
  return {
    email: typeof session?.user?.email === 'string' ? session.user.email : null,
    provider: typeof provider === 'string' ? provider : null,
    expiresAt: typeof session?.expires_at === 'number' ? session.expires_at : 0,
  };
}

export async function startSupabaseOAuth(
  provider: SupabaseOAuthProvider,
  redirectTo?: string
): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl(redirectTo), skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new Error(error?.message ?? 'Could not start sign in.');
  return data.url;
}

export async function exchangeSupabaseCode(callbackUrl: string): Promise<AuthSessionSummary> {
  const callbackError = supabaseOAuthErrorMessage(callbackUrl);
  if (callbackError) throw new Error(callbackError);
  const code = firstCallbackParam(callbackUrl, 'code');
  if (!code) throw new Error('Could not complete sign in. Start the login again.');
  const { data, error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error || !data?.session) throw new Error(error?.message ?? 'Sign in failed.');
  return summarize(data.session);
}

export async function loadAuthSessionSummary(): Promise<AuthSessionSummary | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session ? summarize(data.session) : null;
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function refreshSupabaseSession(): Promise<AuthSessionSummary | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await getSupabaseClient().auth.refreshSession();
  if (error || !data?.session) return null;
  return summarize(data.session);
}

export async function clearAuthSession(): Promise<void> {
  if (!supabaseConfigured()) return;
  await getSupabaseClient().auth.signOut({ scope: 'local' });
}
```

Note: `redirectUrl(override?)` is the existing helper (desktop `kengui://auth/callback` / loopback vs `${origin}/connect`); keep it. Remove the old `PKCE_*` constants, `TOKEN_REFRESH_SKEW_SECONDS`, `sha256Base64Url`, `randomBase64Url`, `base64Url`, `createSupabaseOAuthUrl`, `normalizeSession`, `supabaseTokenErrorMessage`, `supabaseAnonKey`/`supabaseAuthHeaders`, and the `secureStore`/`normalizeSupabaseBaseUrl` imports.

- [ ] **Step 4: Update `src/auth/oauthStart.ts`**

Replace the `createSupabaseOAuthUrl`/`supabaseConfigured`/`supabaseProviderCallbackUrl` imports and the option shape. Drop `supabaseBaseUrl`; call `startSupabaseOAuth`:

```ts
import { startSupabaseOAuth, supabaseConfigured, supabaseProviderCallbackUrl, type SupabaseOAuthProvider } from './supabase';
import { authCallback, externalUrl } from '../platform';

export const LOCAL_HOSTED_AUTH_MESSAGE =
  'Local Kengui Cloud sign in requires the Tauri app. Launch with `rtk npm run tauri -- dev` and try again.';

export type OAuthCallbackMode = 'browser' | 'desktop';

export async function beginSupabaseOAuth(options: {
  provider: SupabaseOAuthProvider;
  callbackMode?: OAuthCallbackMode;
  requireNativeCallbackForLocalhost?: boolean;
}): Promise<void> {
  const { provider, callbackMode = options.requireNativeCallbackForLocalhost ? 'desktop' : 'browser' } = options;
  if (!supabaseConfigured()) throw new Error('Supabase auth is not configured for this build.');

  const redirectTo = callbackMode === 'desktop' ? await authCallback.prepareAuthRedirectUrl() : null;
  if (!redirectTo && callbackMode === 'desktop') throw new Error(LOCAL_HOSTED_AUTH_MESSAGE);

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
```

- [ ] **Step 5: Update the two `beginSupabaseOAuth` call sites**

In `src/pages/Connecting.tsx` (`beginOAuth`, ~line 129) and `src/pages/Settings/AccountSettings.tsx` (`beginOAuth`, ~line 66), remove the `supabaseBaseUrl: undefined` property from the `beginSupabaseOAuth({...})` argument.

- [ ] **Step 6: Run auth tests + typecheck**

Run: `npx vitest run src/auth/supabase.test.ts && npm run typecheck`
Expected: PASS (auth tests green; typecheck clean).

- [ ] **Step 7: Commit**

```bash
git add src/auth/supabase.ts src/auth/oauthStart.ts src/auth/supabase.test.ts src/pages/Connecting.tsx src/pages/Settings/AccountSettings.tsx
git commit -m "feat(auth): delegate PKCE OAuth to supabase-js"
```

---

### Task 5: cloudClient `apikey` header

**Files:**
- Modify: `src/api/cloudClient.ts` (`authHeaders`, line ~31)
- Test: `src/api/cloudClient.test.ts` (new)

**Interfaces:**
- Consumes: `getAccessToken`, `refreshSupabaseSession` from `../auth/supabase`; `supabaseAnonKey` from `../auth/supabaseClient`.

- [ ] **Step 1: Write the failing test**

Create `src/api/cloudClient.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth/supabase', () => ({
  getAccessToken: vi.fn(async () => 'user-token'),
  refreshSupabaseSession: vi.fn(async () => null),
}));
vi.mock('../auth/supabaseClient', () => ({ supabaseAnonKey: vi.fn(() => 'anon-key') }));
vi.mock('../store/connection', () => ({
  useConnectionStore: { getState: () => ({ serverMode: 'hosted', serverUrl: 'https://p.supabase.co' }) },
}));

import { cloudRequest } from './cloudClient';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_KENKUI_CLOUD_FUNCTIONS_URL', 'https://p.supabase.co/functions/v1');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
});

describe('cloudRequest', () => {
  it('sends both the apikey header and the user bearer token', async () => {
    await cloudRequest('list-jobs?limit=1');
    const [, init] = (fetch as any).mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe('anon-key');
    expect(headers.get('Authorization')).toBe('Bearer user-token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/cloudClient.test.ts`
Expected: FAIL (`apikey` header absent).

- [ ] **Step 3: Add the apikey header in `authHeaders`**

In `src/api/cloudClient.ts`, add the import and set the header:

```ts
import { supabaseAnonKey } from '../auth/supabaseClient';
```

Inside `authHeaders`, after setting Content-Type and before/after the token:

```ts
  headers.set('apikey', supabaseAnonKey());
  const token = await getAccessToken();
  if (!token) throw new CloudApiError(401, 'Sign in to Kengui Cloud before submitting cloud jobs.');
  headers.set('Authorization', `Bearer ${token}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/cloudClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/cloudClient.ts src/api/cloudClient.test.ts
git commit -m "fix(cloud): send apikey header on Edge Function requests"
```

---

### Task 6: Fixed hosted project — read-only hosted URL

**Files:**
- Modify: `src/pages/Connecting.tsx`
- Test: `src/pages/Connecting.test.tsx` (new)

**Interfaces:**
- Consumes: `HOSTED_RUNTIME_URL` constant already defined in `Connecting.tsx` (from `VITE_KENGUI_HOSTED_URL` / `VITE_SUPABASE_URL` / `'https://api.kengui.app'`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/Connecting.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../auth/supabase', () => ({
  clearAuthSession: vi.fn(),
  exchangeSupabaseCode: vi.fn(),
  loadAuthSessionSummary: vi.fn(async () => null),
  supabaseOAuthErrorMessage: vi.fn(() => null),
}));
vi.mock('../auth/oauthStart', () => ({ beginSupabaseOAuth: vi.fn() }));
vi.mock('../platform', () => ({ deepLinks: { onAuthCallback: vi.fn(async () => () => {}) } }));

import Connecting from './Connecting';

describe('Connecting hosted section', () => {
  it('shows the hosted control plane URL as read-only text, not an editable input', async () => {
    vi.stubEnv('VITE_KENGUI_ENABLE_HOSTED', 'true');
    render(<MemoryRouter><Connecting /></MemoryRouter>);
    // Select the "Kengui Cloud" card
    screen.getByText('Kengui Cloud').click();
    expect(screen.queryByLabelText(/Hosted control plane URL/i)).toBeNull();
    expect(screen.getByText(/api\.kengui\.app|supabase\.co/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Connecting.test.tsx`
Expected: FAIL (editable input still present).

- [ ] **Step 3: Replace the editable hosted input with read-only display**

In `src/pages/Connecting.tsx`:
- Remove the `hostedUrl` state (`useState`) declaration.
- In `connect(mode)`, change the hosted branch of `nextUrl` from `normalizeSupabaseBaseUrl(hostedUrl)` to `normalizeSupabaseBaseUrl(HOSTED_RUNTIME_URL)`.
- Replace the `selectedMode === 'hosted'` section's editable `Input` block with a read-only display:

```tsx
{selectedMode === 'hosted' && (
  <section className="rounded-lg border bg-card p-5 shadow-sm">
    <div className="flex flex-col gap-1">
      <Label>Hosted control plane</Label>
      <p className="text-sm text-muted-foreground break-all">{HOSTED_RUNTIME_URL}</p>
    </div>
  </section>
)}
```

Remove the now-unused `Input` import if nothing else uses it (check the external-server section still uses `Input`; if so, keep the import).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/Connecting.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Connecting.tsx src/pages/Connecting.test.tsx
git commit -m "feat(connect): fix hosted runtime to the build-time Kengui Cloud origin"
```

---

### Task 7: Docs + env example + full gate

**Files:**
- Modify: `docs/cloud-auth.md`
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example`**

Ensure the cloud vars document the fixed hosted-project model — that a hosted-facing build sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **hosted** project's own dashboard values (never the `supabase-demo` key or a local `sb_publishable_` key), and that the hosted runtime origin is `VITE_KENGUI_HOSTED_URL`.

- [ ] **Step 2: Update `docs/cloud-auth.md`**

Add a short "Auth client" note: Kengui uses `@supabase/supabase-js` (PKCE, `detectSessionInUrl:false`) backed by the keychain `secureKv` adapter; the anon key is attached automatically plus explicitly on Edge Function calls via `cloudClient`. Note that the hosted control-plane URL is fixed at build time and no longer user-entered. Keep the existing local-key (`ANON_KEY` vs `sb_publishable_`) and GitHub-callback sections.

- [ ] **Step 3: Run the full gate**

Run: `npm run check`
Expected: PASS (typecheck + all vitest + build + `cargo check`).

- [ ] **Step 4: Commit**

```bash
git add docs/cloud-auth.md .env.example
git commit -m "docs(cloud-auth): document fixed hosted project and supabase-js client"
```

---

## Self-Review

- **Spec coverage:** Rust opaque storage (T1), secureKv (T2), client factory (T3), supabase.ts rewrite + oauthStart + `startSupabaseOAuth` (T4), apikey fix (T5), fixed hosted UI (T6), docs/env (T7). All spec components mapped.
- **Backward-compat:** `refreshSupabaseSession` retained (3 external consumers); all other public exports retained. `getAccessToken`/`loadAuthSessionSummary`/`clearAuthSession` signatures unchanged for `Step4Review.tsx`, `runtime.ts`, `client.ts`, pages.
- **Type consistency:** `summarize()` returns `AuthSessionSummary` used by `exchangeSupabaseCode`/`loadAuthSessionSummary`/`refreshSupabaseSession`; `Connecting.tsx`/`AccountSettings.tsx` read `.email/.provider/.expiresAt` — compatible. `secureKv` matches supabase-js `SupportedStorage`.
- **Manual verification (post-plan):** build with hosted env, sign in end-to-end, confirm a real hosted `list-jobs` returns without `Invalid API key`.
```
