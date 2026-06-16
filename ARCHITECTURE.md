# Kengui Architecture

Kengui is a thin Tauri shell around a rich React UI. It should behave like a
client of `kenkui`, not like a second implementation of audiobook processing.

## Layering

- **React UI**: screens, forms, optimistic state, progress display, and user
  workflows.
- **API client**: typed HTTP calls to the active server runtime.
- **Runtime adapters**: choose between local sidecar, external server, and hosted
  service.
- **Platform adapters**: the only React-side modules that may import Tauri APIs.
  UI, stores, runtime code, and API clients should call `src/platform` wrappers
  instead of importing `@tauri-apps/*` directly.
- **Tauri commands**: process supervision, native dialogs, diagnostics, and
  secure storage integration.
- **Server**: queueing, worker execution, local/remote compute, artifacts, and
  OpenAPI.
- **Library**: ebook parsing, NLP, voice catalog, rendering, and post-processing.

## Build Profiles

- `desktop-foss`: local managed sidecar, external server, and BYOK settings.
- `desktop-store`: same user-facing app, with signed distribution and optional
  hosted credits.
- `mobile-store`: hosted or external server only; no local Python/TTS runtime.

Build profiles should toggle adapters and capabilities, not fork product logic.

## Contracts

The intended source of truth for server shapes is `kenkui` OpenAPI under `/v1`.
Until generation is wired in, local TypeScript interfaces in `src/api` must be
treated as temporary mirrors and covered by tests.

## Security Defaults

- The WebView uses an explicit CSP.
- Tauri capabilities stay minimal.
- Local server URLs default to loopback.
- Secrets are not stored in plain JSON settings.
- Hosted billing verification belongs server-side; the app only stores
  non-sensitive entitlement state.

## Operational Principles

- Local-first on desktop.
- Transparent paid hosted compute on app stores.
- Observable by default: sidecar logs, health checks, readiness events, and
  diagnostic export should be part of the runtime contract.
- Fail closed for credentials, entitlements, and native capabilities.
