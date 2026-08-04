# AI Guide for `kengui`

This repository contains the web and Tauri GUI clients for `kenkui`. Keep the
platform shells small, typed, and debuggable.

## Product Boundary

- `kenkui` owns audiobook domain logic.
- `kenkui` owns HTTP routes, queueing, worker execution, hosted compute, and the
  OpenAPI contract.
- `kengui` owns the web UI, desktop/mobile shell, runtime selection, app-store
  billing adapters, and local sidecar supervision.
- Do not move parsing, NLP, TTS, queue policy, billing verification, or Modal
  orchestration into the React app.

## Licensing And Revenue

- First-party code in this app should use MIT-compatible licensing.
- Revenue should come from the operated hosted compute service, not source
  restrictions.
- Desktop FOSS builds must preserve local/self-hosted/BYOK operation.
- Store builds may use hosted credits or subscriptions through store billing.

## Runtime Modes

- `local`: desktop-managed `kenkui serve` sidecar.
- `external`: user-supplied or self-hosted server URL.
- `hosted`: Kengui-operated service with entitlements.

The shared React app in `packages/app` talks to `packages/platform`, not directly
to Tauri commands. `apps/web` and `apps/desktop` own platform bootstrapping; Rust
commands should remain a narrow capability surface for process supervision and
diagnostics.

## Maintainer Rules

- Use generated or contract-tested API types once `kenkui` publishes
  OpenAPI. Do not let hand-written DTOs drift silently.
- Keep Tauri capabilities minimal and document new commands.
- Do not store API keys or auth tokens in `plugin-store`; use platform secure
  storage when credentials are added.
- Keep UI state serializable and recoverable.
- Add tests for runtime mode changes, sidecar lifecycle behavior, API errors,
  and billing/entitlement edge cases.
- Run `npm run check` before handing off changes.
