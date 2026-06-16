# ADR 0001: MIT Client With Paid Hosted Compute

## Status

Accepted

## Context

Kengui should remain as FOSS as possible while supporting app-store
monetization. Copyleft licensing can protect service-side openness, but it also
adds friction for app-store distribution, sidecar packaging, and third-party
integrations.

## Decision

Use MIT-compatible licensing for first-party Kengui app code. Monetize the
operated hosted compute service through credits or subscriptions, not source
restrictions.

## Consequences

- Users can run local, BYOK, or self-hosted workflows without paying Kengui.
- Store users can pay for Kengui-operated hosted compute.
- Forks and competitors are allowed; distribution, UX, reliability, and trust
  become the moat.

