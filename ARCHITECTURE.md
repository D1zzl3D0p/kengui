# Kengui Architecture

Kengui ships a website and a thin Tauri desktop shell around one shared React
application. Both should behave like clients of `kenkui`, not like second
implementations of audiobook processing.

## Repository Layout

- `apps/web`: browser entry point and website build configuration.
- `apps/desktop`: desktop entry point, Tauri configuration, Rust commands, and
  native capabilities.
- `packages/app`: shared product workflows, routes, state, API clients, and
  application-specific components.
- `packages/platform`: the browser/native capability boundary. This is the only
  shared package that may import `@tauri-apps/*`.
- `packages/ui`: platform-independent visual primitives.

## Layering

- **React UI**: screens, forms, optimistic state, progress display, and user
  workflows.
- **API client**: typed HTTP calls to the active server runtime.
- **Runtime adapters**: choose between local sidecar, external server, and hosted
  service.
- **Platform adapters**: UI, stores, runtime code, and API clients call
  `packages/platform` wrappers instead of importing `@tauri-apps/*` directly.
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

The source of truth for server shapes is `kenkui` OpenAPI under `/v1`.
`npm run contract:generate` writes the derived TypeScript contract under
`packages/app/src/api/generated`; local ergonomic types build on that generated
contract and remain covered by tests.

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
