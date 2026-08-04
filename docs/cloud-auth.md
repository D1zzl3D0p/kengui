# Cloud Auth

Kengui uses Supabase Auth as the OAuth broker for hosted/cloud accounts. The
desktop app opens a Supabase authorize URL, Supabase redirects to GitHub, and
GitHub redirects back to Supabase before Supabase sends the final code to
Kengui.

## Auth client

Kengui delegates the OAuth/PKCE flow to `@supabase/supabase-js`
(`packages/app/src/auth/supabaseClient.ts`), configured with `flowType: 'pkce'`,
`detectSessionInUrl: false` (the desktop app receives the callback over a
loopback/deep link, not a web redirect), and `autoRefreshToken: true`. Session
state (including the refresh token and the transient PKCE code-verifier) is
persisted through the `secureKv` adapter, which stores a single JSON blob in the
OS keychain (`apps/desktop/src-tauri/src/lib.rs`) with a `localStorage` fallback on platforms
without native keychain support. The client library attaches the `apikey` header
to every request automatically; `packages/app/src/api/cloudClient.ts` also sets it explicitly
on Edge Function calls.

"Kengui Cloud" targets **one fixed hosted project**. The Supabase Auth origin,
the anon key, and the hosted control-plane URL are all baked into the build from
`VITE_*` env — there is no runtime field for entering a Supabase URL or key, so
the auth origin and the runtime origin can never diverge.

## GitHub Callback URL

If GitHub shows this error:

```text
The redirect_uri is not associated with this application.
```

the GitHub OAuth app is missing the Supabase provider callback URL. GitHub does
not redirect directly to Kengui's desktop loopback listener. It redirects to:

```text
<SUPABASE_BASE_URL>/auth/v1/callback
```

Use the exact Supabase base URL that Kengui is signing in against:

- Local Supabase CLI default:

  ```text
  http://127.0.0.1:54321/auth/v1/callback
  ```

  GitHub recommends loopback IP literals for OAuth loopback URLs instead of
  `localhost`. The local control-plane Supabase config should emit
  `http://127.0.0.1:54321/auth/v1/callback` as GitHub's `redirect_uri`.

- Hosted Supabase project:

  ```text
  https://<project-ref>.supabase.co/auth/v1/callback
  ```

- Hosted Supabase behind a custom auth domain:

  ```text
  https://<auth-domain>/auth/v1/callback
  ```

Configure that value as the GitHub OAuth App's **Authorization callback URL**.
The GitHub OAuth App client ID and client secret in Supabase's GitHub provider
settings must come from the same GitHub OAuth App.

If the error persists after changing the callback URL, confirm that the GitHub
OAuth App you edited has the same **Client ID** as the `client_id` in the
GitHub authorize URL emitted by Supabase. For the local stack, inspect the
`Location` header from the verification command below and compare its
`client_id` value with the GitHub OAuth App settings page. Updating a different
OAuth app will leave this error unchanged.

For separate local and hosted Supabase auth environments, use separate GitHub
OAuth Apps or update the GitHub OAuth App callback URL to match the environment
being tested.

## Kengui Redirects

For hosted desktop sign-in, Kengui passes a `redirect_to` value like:

```text
http://127.0.0.1:<random-port>/auth/callback
```

That URL is Kengui's final desktop callback. It must be allowed by Supabase's
redirect URL allow-list, but it is not the callback URL that GitHub validates.

For browser-mode development, Kengui falls back to:

```text
<window-origin>/connect
```

Allow this URL in Supabase when testing browser-only sign-in.

## Hosted build configuration

A cloud-enabled Kengui build has two separate origins:

- `VITE_SUPABASE_URL` is the default hosted Supabase Auth origin. It must be
  paired with the public `VITE_SUPABASE_ANON_KEY` issued by that same Supabase
  project.
- `VITE_KENGUI_HOSTED_URL` is the hosted runtime origin. When Edge Functions
  have a distinct endpoint, `VITE_KENKUI_CLOUD_FUNCTIONS_URL` configures that
  functions origin explicitly.

Authorize, provider callback, PKCE token exchange, and token refresh requests
all use the `VITE_SUPABASE_URL` Auth origin and its paired
`VITE_SUPABASE_ANON_KEY`. Runtime and Edge Function calls use the hosted
runtime/functions configuration. Because the project is fixed at build time,
these origins refer to the same hosted project; the app exposes no field for
entering a Supabase URL or key at runtime, so a build's Auth credentials can
never be sent to a different project. A build with no `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` reports Auth as unconfigured rather than sending a
credential anywhere.

Use the **hosted** project's own `VITE_SUPABASE_ANON_KEY` from its dashboard.
The `supabase-demo` key and any local `sb_publishable_` key are project-scoped to
the local stack and will be rejected by a hosted project with
`401 Invalid API key` — this was the root cause documented in
`cloud-auth-hosted-invalid-api-key.md`.

Vite embeds `VITE_*` values into the client bundle. Changing any of these client
settings requires rebuilding and releasing Kengui; deploying Supabase database
or Edge Function code does not update an existing Kengui bundle.

## Local Supabase keys and preflight

Supabase CLI 2.110.0 is the currently tested local compatibility boundary. For
that local stack, set `VITE_SUPABASE_ANON_KEY` to the legacy JWT `ANON_KEY` from
the same `supabase status` output as `VITE_SUPABASE_URL`. Do not use its
`sb_publishable_` `PUBLISHABLE_KEY`: the current local Auth token route rejects
that key. This restriction is local only; hosted publishable keys remain
supported where the hosted gateway accepts them.

Never substitute an `sb_secret_` key, `SERVICE_ROLE_KEY`, or another
service-role value in Kengui. Desktop configuration must contain only a public
client key.

Before starting interactive OAuth against the local stack, run:

```bash
npm run selftest:auth
```

A passing preflight reports that the configured key matches `ANON_KEY`, the
invalid-code probe reaches the GoTrue flow-state boundary, direct user
validation and correct PKCE pass, the intentionally wrong PKCE verifier is
rejected, and downstream Edge failures are classified separately. It does not
require an interactive provider login.

Vite embeds `VITE_*` configuration when it starts or builds. After changing
`VITE_SUPABASE_ANON_KEY`, fully stop and restart Vite/Tauri so the desktop app
does not keep a stale bundled key.

For `401 Invalid API key` from the token route, check the Supabase URL/key
pairing and stale bundle first. Cookies and provider callback configuration are
different boundaries and should not be the first suspects for this response.

After a future Supabase CLI/local-stack upgrade, remove the local `ANON_KEY`
requirement only when `PUBLISHABLE_KEY` passes the token-route, signup/user, and
correct-PKCE preflight probes. Keep the request-header and lowercase-PKCE
contracts regardless of key format.

## Verification

When running a dev build, the browser console logs `providerCallbackUrl` before
opening the OAuth flow. Compare that value against the GitHub OAuth App's
Authorization callback URL.

You can also verify the local Supabase redirect directly:

```bash
rtk curl -i 'http://127.0.0.1:54321/auth/v1/authorize?provider=github&redirect_to=http%3A%2F%2F127.0.0.1%3A49152%2Fauth%2Fcallback&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=s256&state=teststate'
```

The `Location` header should point to GitHub and include
`redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fv1%2Fcallback` for local
Supabase CLI auth.
