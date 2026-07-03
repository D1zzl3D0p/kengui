# Cloud Auth

Kengui uses Supabase Auth as the OAuth broker for hosted/cloud accounts. The
desktop app opens a Supabase authorize URL, Supabase redirects to GitHub, and
GitHub redirects back to Supabase before Supabase sends the final code to
Kengui.

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

## Verification

When running a dev build, the browser console logs `providerCallbackUrl` before
opening the OAuth flow. Compare that value against the GitHub OAuth App's
Authorization callback URL.

You can also verify the local Supabase redirect directly:

```bash
rtk curl -i 'http://127.0.0.1:54321/auth/v1/authorize?provider=github&redirect_to=http%3A%2F%2F127.0.0.1%3A49152%2Fauth%2Fcallback&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256&state=teststate'
```

The `Location` header should point to GitHub and include
`redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fv1%2Fcallback` for local
Supabase CLI auth.
