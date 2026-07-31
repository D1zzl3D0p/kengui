# Design: supabase-js migration + fixed hosted project

_Date: 2026-07-31 · Branch: `feature/kengui-app`_

## Problem

Kengui authenticates against Supabase with a **hand-rolled PKCE flow**
(`src/auth/supabase.ts`) and binds the Supabase Auth origin **and** anon key to
build-time env (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). The dev build
ships the local `supabase-demo` anon key, and the "Hosted control plane URL"
field only changes the runtime origin — never auth. So any request that reaches
the hosted project carries a local demo credential and is rejected with
`401 Invalid API key`. See `docs/cloud-auth-hosted-invalid-api-key.md` for the
full root-cause report.

There is also a latent bug: `src/api/cloudClient.ts` sends only
`Authorization: Bearer <token>` and **no `apikey` header** on Edge Function
calls, which the hosted gateway can reject on its own.

## Goals

1. **Fixed hosted project.** "Kengui Cloud" is one hosted kenkui-cloud project.
   Auth origin + anon key come from the build; the hosted-URL field cannot cause
   auth/runtime to diverge.
2. **Stop rolling our own token.** Replace the hand-rolled PKCE/exchange/refresh
   with `@supabase/supabase-js`.
3. **Fix the missing `apikey` header** on cloud Edge Function calls.
4. **Preserve the OS-keychain security posture** for stored tokens.

## Non-goals

- Runtime-selectable arbitrary Supabase projects (explicitly deferred; the
  chosen product model is a single fixed hosted project).
- Windows/Linux native keychain storage (still localStorage fallback, unchanged).
- Changing GitHub OAuth App callback config or the CI cloud-build var wiring
  (both remain required and unchanged).

## Approach decision: storage adapter

supabase-js persists session state through a key-value `storage` adapter and
writes **more than one key** (the session under `sb-<ref>-auth-token`, plus a
`…-code-verifier` entry during the PKCE handshake). The current secure store is
session-object-shaped and backed by a **single macOS Keychain slot**.

**Chosen (A): Keychain-backed KV adapter.** A TS `secureKv` keeps an in-memory
`Map` hydrated once from the existing single keychain slot (localStorage
fallback on non-macOS/web) and persists the whole serialized map on every
`setItem`/`removeItem`. All of supabase-js's keys live inside that one blob.
Preserves keychain storage with a minimal Rust change (store an opaque string
instead of a typed struct).

**Rejected (B): localStorage-only.** Zero Rust change, but moves refresh tokens
out of the keychain into plaintext localStorage — a security regression.

## Components

### 1. Rust — `src-tauri/src/lib.rs`

Generalize the three Tauri auth commands to store/return an **opaque string**:

- `save_auth_session(value: String) -> Result<(), AppError>`
- `load_auth_session() -> Result<Option<String>, AppError>`
- `clear_auth_session() -> Result<(), AppError>` (unchanged)

Remove the typed `AuthSession` struct. The macOS `write/read/delete_auth_session`
helpers already operate on strings, so only the command signatures and the
serialize/deserialize wrappers change. Non-macOS behavior is unchanged (write
errors, read returns `None`) so the TS localStorage fallback still engages.

### 2. Platform — `src/platform/secureStore.ts` + `index.ts`

Replace the session-shaped `secureStore` with a generic async KV backing store
and expose a supabase-js-compatible adapter:

```ts
export interface SecureKvStorage {          // matches supabase-js SupportedStorage
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const secureKv: SecureKvStorage;
```

- Hydrates once from `invoke('load_auth_session')` (keychain) → parses the
  JSON map; on invoke failure, falls back to reading the localStorage slot.
- `setItem`/`removeItem` mutate the map, then persist via
  `invoke('save_auth_session', { value })` (keychain) with a localStorage
  fallback.
- A single hydrate promise guards against races on first access.

Remove `StoredAuthSession` / `SecureSessionStore` exports (no longer used).

### 3. Auth client factory — `src/auth/supabaseClient.ts` (new)

Single seam that creates and memoizes the client:

```ts
createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,   // desktop deep-link / loopback, not a web redirect
    autoRefreshToken: true,
    persistSession: true,
    storage: secureKv,
  },
});
```

Exposes `getSupabaseClient()` (throws a clear "not configured" error when URL or
key is absent) and `supabaseConfigured()`. Tests mock this module.

### 4. Auth API — `src/auth/supabase.ts` (rewrite, same exports)

Keep the public surface so callers barely change:

| Export | New implementation |
|--------|--------------------|
| `supabaseConfigured()` | re-export from `supabaseClient` |
| `beginSupabaseOAuth` (in `oauthStart.ts`) / OAuth start | `auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })` → return `data.url` for `openExternalUrl`; keep dev `providerCallbackUrl` debug log |
| `exchangeSupabaseCode(callbackUrl)` | parse error via `supabaseOAuthErrorMessage`; extract `code`; `auth.exchangeCodeForSession(code)`; map to `AuthSessionSummary` |
| `getAccessToken()` | `(await auth.getSession()).data.session?.access_token ?? null` (getSession refreshes when expired) |
| `loadAuthSessionSummary()` | derive `{ email, provider, expiresAt }` from `auth.getSession()` |
| `clearAuthSession()` | `auth.signOut({ scope: 'local' })` |
| `supabaseOAuthErrorMessage()` | unchanged pure helper (retained + tests kept) |

Delete: hand-rolled `createSupabaseOAuthUrl` (PKCE challenge, `sessionStorage`
verifier), `normalizeSession`, `refreshSupabaseSession`, `authOrigin`
bookkeeping, `supabaseTokenErrorMessage`.

`oauthStart.ts` transition: `beginSupabaseOAuth` keeps deciding `callbackMode`
(desktop loopback vs `${origin}/connect` via the retained `redirectUrl()`
selection), but instead of calling `createSupabaseOAuthUrl` it calls a new
`startSupabaseOAuth(provider, redirectTo)` that runs
`auth.signInWithOAuth({ skipBrowserRedirect: true })` and returns `data.url` to
open. Retain `supabaseProviderCallbackUrl()` as a pure helper (computes
`<supabase-origin>/auth/v1/callback`) for the dev debug log and the docs
verification step.

Note: `exchangeCodeForSession` reads the verifier that `signInWithOAuth` wrote to
`secureKv`, so persistence (not `sessionStorage`) is what carries PKCE across a
browser-mode full-page reload.

### 5. Cloud client — `src/api/cloudClient.ts`

- `authHeaders()` also sets `apikey: <VITE_SUPABASE_ANON_KEY>` (fixes the latent
  bug). Token still comes from `getAccessToken()`.
- On 401/403 retry, call `auth.refreshSession()` (or rely on `getSession`
  refresh) instead of the removed `refreshSupabaseSession`.
- Keep fetch-based requests + `redactSignedUrls`. `cloudFunctionsUrl()` in the
  fixed model resolves from the build-time hosted/functions env.

### 6. Fixed hosted project UI — `src/pages/Connecting.tsx`

- Render the hosted control-plane URL as **read-only** (display the configured
  `VITE_KENGUI_HOSTED_URL`); remove the free-text input and `hostedUrl` state.
- `connect('hosted')` uses the build-time hosted origin constant, not user input.
- Auth continues to use the build-time Supabase origin/key, which now matches the
  runtime — the two can no longer diverge.

## Tests

- `src/auth/supabase.test.ts`: drop the cases coupled to the hand-rolled
  mechanism (fetch URLs, `kengui.pkce.verifier`, `authOrigin`, header shapes).
  Add behavior tests against a mocked `supabaseClient`:
  - OAuth start returns/opens the provider URL and respects `redirectTo`.
  - `exchangeSupabaseCode` calls `exchangeCodeForSession` and maps the summary;
    surfaces `supabaseOAuthErrorMessage` before exchanging.
  - `getAccessToken` returns the session token / null.
  - `clearAuthSession` calls `signOut`.
  - `supabaseConfigured` gating.
  - Keep all `supabaseOAuthErrorMessage` tests.
- Add `secureKv` tests (hydrate, set/get/remove, keychain-failure → localStorage
  fallback).
- `src/pages/Settings.test.tsx`: update mocks to the new module surface.
- `scripts/selftest-local-supabase-auth.mjs`: unchanged (still validates the
  local stack directly).

## Config / docs

- `.env.example` + `docs/cloud-auth.md`: document the fixed hosted-project model
  and that a hosted-facing build sets `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` to the **hosted** project's own values (not the demo
  or local keys).
- CI `desktop-cloud-build.yml`: unchanged (already injects hosted vars).

## Risks / verification

- `@supabase/supabase-js` (~100KB gz) added — acceptable for desktop.
- Verify method names/options against the installed `@supabase/supabase-js`
  version before finalizing (`signInWithOAuth`, `exchangeCodeForSession`,
  `getSession`, `signOut`, `SupportedStorage`).
- Run `npm run check` (typecheck + tests + build + `cargo check`) as the gate.
- Manual: build with hosted env, sign in end-to-end, confirm a real hosted
  `list-jobs` succeeds (no `Invalid API key`).
```
