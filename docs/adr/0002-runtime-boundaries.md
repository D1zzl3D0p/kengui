# ADR 0002: Runtime Adapters

## Status

Accepted

## Context

Desktop builds can supervise a local server, while mobile builds cannot depend
on a bundled Python/TTS runtime. Store builds also need a clean hosted compute
path.

## Decision

Kengui exposes three runtime modes:

- `local`: Tauri starts and supervises a local `kenkui serve` sidecar.
- `external`: the app connects to a user-provided server URL.
- `hosted`: the app connects to the Kengui-operated service.

React uses a runtime adapter boundary. Tauri commands remain narrow native
capabilities rather than product logic.

## Consequences

- Mobile and desktop can share UI flows.
- Hosted billing and local process management can evolve independently.
- Server API compatibility must be checked with contract tests.
