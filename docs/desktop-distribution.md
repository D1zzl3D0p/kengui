# Desktop Distribution

Kengui ships as a Tauri desktop app. The current desktop release path is a
GitHub release with signed/notarized native bundles for macOS, Windows, and
Linux.

The desktop bundle identity is currently `app.kengui.desktop` and the displayed
product name is `Kengui`.

The default GitHub desktop build is the FOSS profile: it exposes local and
external runtimes only. Hosted/cloud mode is hidden unless the build sets
`VITE_KENGUI_ENABLE_HOSTED=true`.

The app icon source is `assets/app-icon.svg`. Regenerate desktop icons with:

```bash
npm run tauri -- icon assets/app-icon.svg
```

## Build locally

```bash
npm ci
npm run check
npm run desktop:build
```

Tauri writes bundles under `src-tauri/target/release/bundle/`.

## Local kenkui runtime bootstrap

GitHub desktop builds automatically look for a `kenkui` executable on `PATH` or
in uv's default tool bin directory (`~/.local/bin`, or `UV_TOOL_BIN_DIR` when
set). If it is missing, Kengui runs:

```bash
uv tool install --upgrade kenkui
```

The fallback install screen shows the same command if either `uv` is missing or
the install fails. Before cutting a release, make sure the newest compatible
`kenkui` package has been published to PyPI.

## GitHub release workflow

The workflow at `.github/workflows/desktop-release.yml` builds on:

- `macos-latest` for `.app`/`.dmg` artifacts.
- `windows-latest` for Windows installer artifacts.
- `ubuntu-22.04` for Linux packages.

Run it in either mode:

1. **Draft release:** push a version tag such as `v0.1.0`, or run the workflow
   manually with `tag=v0.1.0`. The workflow creates a draft GitHub release and
   uploads Tauri bundles.
2. **Artifact-only smoke build:** run the workflow manually with no tag. It does
   not create a release; it uploads per-platform artifacts for inspection.

## Required GitHub secrets for signed releases

Unsigned smoke builds can run without these secrets. Public releases should be
signed so users do not see operating-system trust warnings.

### macOS Developer ID distribution outside the Mac App Store

- `APPLE_CERTIFICATE` — base64-encoded `.p12` signing certificate.
- `APPLE_CERTIFICATE_PASSWORD` — password for the `.p12`.
- `APPLE_SIGNING_IDENTITY` — Developer ID Application identity name.
- `APPLE_ID` — Apple ID used for notarization.
- `APPLE_PASSWORD` — app-specific password or App Store Connect API auth value
  accepted by the Tauri notarization setup.
- `APPLE_TEAM_ID` — Apple Developer Team ID.

Apple App Store builds use an Apple Distribution certificate and provisioning
profile instead of the Developer ID/notarization path.

### Windows distribution outside the Microsoft Store

Add a Windows code-signing certificate flow before the first public Windows
release. The exact secrets depend on the certificate vendor or cloud/HSM signing
service. Windows Store submission has its own signing and identity requirements.

### Tauri updater, when enabled

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Do not enable public auto-update metadata until an update endpoint and signing
key rotation plan exist.

## Versioning checklist

Before tagging a release:

1. Update `package.json` `version`.
2. Update `src-tauri/tauri.conf.json` `version` to the same semver.
3. Update `src-tauri/Cargo.toml` `version` if the Rust crate version should
   track the app release.
4. Run `npm run check`.
5. Create and push the tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

## App-store distribution checklist

Store builds should be treated as separate build profiles from the FOSS desktop
release. Current repository docs define:

- `desktop-foss`: local and external runtimes, no store billing.
- `desktop-store`: local, external, and hosted runtimes, store billing where
  required.
- `mobile-store`: external and hosted only, no local Python/TTS sidecar.

Remaining work before Mac App Store / Microsoft Store / future mobile stores:

### Hosted compute and API

- Deploy a production `kenkui` service, likely on Modal for worker execution.
- Thread Modal job orchestration through `kenkui`, not through the React app.
- Preserve the versioned `kenkui` HTTP/OpenAPI contract used by `kengui`.
- Add hosted job lifecycle endpoints for submission, progress, cancellation,
  retries, artifact lookup, and cost/credit state.
- Enforce server-side quotas, rate limits, job timeouts, idempotency keys, and
  abuse controls.

### Auth, accounts, and data

- Add account auth for hosted mode. Local and external modes must remain usable
  without a Kengui account.
- Store auth tokens in platform secure storage when credentials are added; do
  not store tokens in `plugin-store`.
- Add a backend database for users, entitlements, purchases, job metadata,
  provider credentials metadata, audit logs, and artifact records. SQLite is fine
  for a small single-service deployment; use managed Postgres if Modal workers,
  billing webhooks, and dashboard/admin operations need stronger concurrency and
  operational tooling.
- Add migrations, backups, retention policies, and data deletion/export flows.

### Object storage

- Provision Cloudflare R2, S3, or equivalent object storage for uploaded books,
  intermediate render assets, completed audio/M4B artifacts, logs, and temporary
  audition outputs.
- Use presigned upload/download URLs, lifecycle expiry rules, content-type
  metadata, malware/format validation, and per-user access checks.
- Keep copyrighted source uploads and generated artifacts on short, explicit
  retention windows by default.

### Billing and entitlements

- Add an entitlement service that translates Apple/Microsoft/Google purchase
  state and web purchases into hosted compute credits/subscriptions.
- Add server-side receipt/webhook verification; never trust client-side purchase
  state alone.
- Show cost/credit state before submitting hosted work.
- Keep app-store builds compliant: if hosted compute is sold inside the app as a
  digital service, use the required store billing path for that platform.

### Store-specific packaging

- Apple: Apple Developer Program, matching Bundle ID for `tauri.conf.json`
  `identifier`, Apple Distribution certificate/provisioning profile for App
  Store, Developer ID certificate/notarization for direct downloads, privacy
  nutrition labels, app privacy policy URL, sandbox/capability review.
- Microsoft: Partner Center developer account, reserved product name, signed
  offline installer for Store listing, privacy policy URL, age rating, screenshots
  and listing assets.
- Linux stores/repos: decide whether to publish AppImage/deb/rpm only, plus
  Snapcraft/Flathub/AUR if desired. Each store has its own metadata and sandbox
  rules.

### Product, compliance, and operations

- Privacy policy, terms of service, refund/support policy, support contact, and
  account deletion process.
- Crash/error reporting with user consent and no secrets in logs.
- Observability for hosted jobs: metrics, traces/logs, alerting, dead-letter or
  retry queues, and admin tooling.
- Security review for uploads, SSRF/path traversal, token storage, CORS, CSP,
  dependency/license scanning, and minimal Tauri capabilities.
- Release/update policy: signed builds, changelog, rollback plan, staged rollout,
  and updater metadata if direct-download auto-update is enabled.
