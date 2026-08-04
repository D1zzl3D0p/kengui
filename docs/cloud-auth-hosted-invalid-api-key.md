# Report: "Invalid API key" when connecting Kengui to hosted kenkui-cloud

> Historical layout note: this investigation predates the monorepo migration.
> Paths beginning with `src/` now live under `packages/app/src/`, and
> `src-tauri/` now lives under `apps/desktop/src-tauri/`.

_Investigation date: 2026-07-31. Branch: `feature/kengui-app`._

## TL;DR

- **This is a Kengui issue, not a kenkui-cloud issue.** The hosted Supabase
  project (`emvufncalvvzmsscdsip`) is healthy, reachable, and still has its
  legacy JWT keys enabled. Nothing is misconfigured on the cloud side.
- **Root cause:** Kengui binds the Supabase **Auth origin** _and_ the **anon
  key** at build time to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. In the
  dev build those are the **local Supabase CLI stack** and the well-known
  **`supabase-demo` anon key**. The "Hosted control plane URL" text field only
  changes the *runtime/functions* origin — it does **not** redirect
  authentication and does **not** supply a hosted anon key. So any request that
  actually reaches the hosted project carries a **local demo credential the
  hosted project never minted**, and the hosted gateway replies
  `401 {"message":"Invalid API key"}`.
- **Why it works locally but not hosted:** locally the runtime origin, the Auth
  origin, and the anon key all point at the *same* local stack, so the mismatch
  is invisible. The moment the runtime diverges from the build-time Auth
  origin/key (i.e. hosted), the demo credentials are sent to a project that
  cannot recognize them.

## How the conclusion was reached (evidence)

1. **Decoded the shipped anon key.** `VITE_SUPABASE_ANON_KEY` in `.env.local`
   decodes to:

   ```json
   { "iss": "supabase-demo", "role": "anon", "exp": 1983812996 }
   ```

   This is the standard Supabase **local-development demo key**, signed with the
   public demo JWT secret. It is cryptographically valid **only** against a local
   stack. Every hosted project has its own distinct keys.

2. **Reproduced the exact symptom.** Sending that demo key to the hosted
   project's auth gateway returns the user's exact error:

   ```
   $ curl -s https://emvufncalvvzmsscdsip.supabase.co/auth/v1/settings \
       -H "apikey: <demo-key>" -H "Authorization: Bearer <demo-key>"
   {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}
   # HTTP 401
   ```

3. **Confirmed the hosted project is fine.** It is linked
   (`.temp/linked-project.json` → `emvufncalvvzmsscdsip`, name `kenkui-cloud`),
   the auth endpoint responds, and the user confirmed the **legacy JWT keys are
   still enabled** in the dashboard. So a *correct* hosted anon key would be
   accepted — the project is not the problem.

4. **Traced the code: there is no runtime path to hosted auth.**
   - `src/pages/Connecting.tsx` `beginOAuth()` → `beginSupabaseOAuth({ supabaseBaseUrl: undefined })`.
   - `src/pages/Settings/AccountSettings.tsx` `beginOAuth()` → same `supabaseBaseUrl: undefined`.
   - `src/auth/supabase.ts` `resolveSupabaseUrl(undefined)` → falls back to
     `import.meta.env.VITE_SUPABASE_URL` (build-time local), and
     `supabaseAuthHeaders()` uses the single build-time
     `VITE_SUPABASE_ANON_KEY` (the demo key).
   - The "Hosted control plane URL" field feeds only `setServerMode(...)` /
     `serverUrl` — i.e. the **runtime/functions** origin used by
     `src/api/cloudClient.ts`, never the auth flow.

   **Net:** the anon key is a single build-time constant, and the hosted URL you
   type is never threaded into authentication. Authentication therefore always
   targets the build-time (local, demo) project.

5. **User-confirmed reproduction facts (2026-07-31):** repro path = "type the
   hosted URL in the app"; hosted anon key = "not sure / probably still the demo
   key" (i.e. a real hosted key was **never configured**); hosted legacy keys =
   "still enabled (default)".

## Is it Kengui or kenkui-cloud?

**Kengui.** Two distinct defects, both client-side:

- **Primary (reported symptom):** local demo Auth origin + demo anon key are
  hardcoded at build time; the UI cannot point auth (or the anon key) at a
  hosted project chosen at runtime.
- **Secondary (latent):** `src/api/cloudClient.ts` `authHeaders()` sets only
  `Authorization: Bearer <user token>` and **never sets an `apikey` header** on
  Edge Function calls. Against the hosted `*.supabase.co` gateway this can itself
  produce "Invalid API key" even with an otherwise-correct build. It is masked
  locally and by the fact that `VITE_KENKUI_CLOUD_FUNCTIONS_URL` in `.env.local`
  currently pins functions to the local stack.

## Past proposed / implemented fixes — and why none resolves this

Documented in `docs/cloud-auth.md` and the current branch. Each targets a
**different boundary** than the one that fails here:

| # | Prior fix | Boundary it addresses | Why it doesn't fix this |
|---|-----------|----------------------|-------------------------|
| 1 | GitHub OAuth App callback URL alignment ("redirect_uri is not associated") | Provider → Supabase callback | "Invalid API key" is rejected by the gateway **before** any provider/redirect logic runs. |
| 2 | `authOrigin` persisted on the session so refresh reuses the same Supabase origin (pending diff: `secureStore.ts`, `supabase.ts`) | Token **refresh** origin | Only affects sessions already created against a correct origin. Sign-in never reaches hosted, so there is nothing to refresh. |
| 3 | "Use the legacy JWT `ANON_KEY` locally, not `sb_publishable_`" + `npm run selftest:auth` | **Local** key format | Correct for local, but says nothing about supplying a **hosted** key at runtime; the demo key is still what ships. |
| 4 | Lowercase `s256` PKCE method | PKCE code-challenge format | Rejected only after key validation passes; irrelevant to a key-recognition 401. |
| 5 | "Auth uses `VITE_SUPABASE_URL`, runtime uses the hosted URL" (docs: _Hosted build configuration_) | Separating auth vs runtime origins | This documents the exact limitation causing the bug: auth is pinned to the **build-time** origin/key with no runtime override wired to the UI. |
| 6 | CI cloud build validates `VITE_SUPABASE_ANON_KEY` is unmasked and `sb_publishable_*`/`eyJ*` | CI build hygiene | Only runs in the `Desktop cloud build` workflow, which the user is **not** using; the dev build still carries the demo key. |

**Do not re-propose any of the above** — they are already in place and address
other boundaries.

## Resolution options

### 0. Immediate unblock (verify the mechanism)

Point a build's **auth** config at the hosted project and rebuild:

```dotenv
# .env.local for a hosted-facing build
VITE_KENGUI_ENABLE_HOSTED=true
VITE_SUPABASE_URL=https://emvufncalvvzmsscdsip.supabase.co
VITE_SUPABASE_ANON_KEY=<hosted project's anon/publishable key from the dashboard>
VITE_KENGUI_HOSTED_URL=https://emvufncalvvzmsscdsip.supabase.co
# Unset (or set to hosted) — currently pinned to local, which overrides hosted mode:
# VITE_KENKUI_CLOUD_FUNCTIONS_URL=
```

- Use the **hosted** project's own key from its dashboard — **not** the
  `supabase-demo` key and **not** the local `sb_publishable_…` key (each project
  has unique keys).
- Because `VITE_*` values are embedded at build time, **fully restart**
  Vite/Tauri after editing.
- Note: with these set, the "Hosted control plane URL" field becomes redundant
  for auth — auth follows the env, not the field.

This confirms the diagnosis but is not the intended long-term UX.

### A. Single fixed hosted build (recommended)

Treat "Kengui Cloud" as one fixed project. Bake hosted `VITE_SUPABASE_URL` +
anon key at build time — the `Desktop cloud build` workflow **already does this**
via `vars.KENGUI_SUPABASE_URL` / `vars.KENGUI_SUPABASE_ANON_KEY`; they simply
need to be populated and that build used. Then make the free-text "Hosted control
plane URL" field non-authoritative (or remove it), so users can't create the
local-auth / hosted-runtime split that caused this. Local dev uses the local
build. This matches how the app is actually architected today.

### B. True runtime project selection (only if arbitrary hosted URLs are a real requirement)

If typing an arbitrary hosted URL must actually work, the app must also obtain
that project's **anon key** at runtime (Supabase exposes no unauthenticated
"give me your anon key" endpoint, so the user has to supply it), and thread
`supabaseBaseUrl` + a per-origin anon key through
`beginSupabaseOAuth → createSupabaseOAuthUrl`, `supabaseAuthHeaders()`, and
`cloudClient`. Today the anon key is a single build-time constant, so this is a
non-trivial change. Option D makes it much cheaper.

### C. Fix the missing `apikey` header (do regardless)

`src/api/cloudClient.ts` should send the project `apikey` header on Edge Function
calls, not just the user Bearer token. This is required by the hosted gateway
and is currently absent. (Option D fixes this for free.)

### D. Stop rolling our own token — adopt `@supabase/supabase-js` (task 3)

The hand-rolled PKCE/token/refresh code in `src/auth/supabase.ts` (~200 lines:
manual authorize URL, `sha256`/base64url challenge, `grant_type=pkce` exchange,
manual refresh) can be delegated to the official client. Sketch:

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false, // desktop deep-link / loopback, not a web redirect
    autoRefreshToken: true,
    persistSession: true,
    storage: secureStoreAdapter, // async getItem/setItem/removeItem over our secureStore
  },
});

// Start OAuth without an in-app browser redirect:
const { data } = await supabase.auth.signInWithOAuth({
  provider,
  options: { redirectTo, skipBrowserRedirect: true },
});
await openExternalUrl(data.url); // open in system browser

// On the deep-link callback:
await supabase.auth.exchangeCodeForSession(code); // library stores the PKCE verifier
```

Why this is the right move:
- Deletes the hand-rolled token exchange **and** refresh logic (and the
  `authOrigin` refresh bookkeeping added in the pending diff).
- supabase-js automatically attaches the `apikey` header to every request —
  **this fixes Option C for free.**
- A client is created per `(url, anonKey)` pair, so **Option B becomes trivial**:
  one client per project instead of a global build-time constant.
- The custom storage adapter supports async storage, so it maps cleanly onto the
  existing Tauri `secureStore`.

Caveats: keep `detectSessionInUrl: false` (desktop uses deep-link/loopback, not a
web redirect); verify the exact method names against the current
`@supabase/supabase-js` docs before implementing; the local stack still rejects
`sb_publishable_` at the token route (finding #3), so the local build keeps using
the legacy `ANON_KEY` — that constraint is orthogonal to the client library.

## Recommended sequence

1. **Unblock now** with Option 0 to see hosted actually work end-to-end.
2. **Adopt Option D** (supabase-js) — it simplifies auth and fixes the missing
   `apikey` header (C) as a side effect.
3. **Decide product intent:** Option A (one fixed hosted project — simplest and
   matches current architecture) vs Option B (arbitrary runtime projects — now
   cheap on top of D). Then make the "Hosted control plane URL" field consistent
   with that decision so the local-auth / hosted-runtime split can't recur.
```
