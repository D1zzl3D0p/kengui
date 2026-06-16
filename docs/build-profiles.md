# Build Profiles

Kengui should use build profiles to select adapters and capabilities without
forking the app.

## desktop-foss

- Runtime adapters: `local`, `external`.
- Billing adapter: `none`.
- Credentials: user-managed provider keys or self-hosted server credentials.
- Local runtime: signed `kenkui serve` sidecar for releases and development.

## desktop-store

- Runtime adapters: `local`, `external`, `hosted`.
- Billing adapter: app-store provider where required.
- Hosted compute is optional and transparent.

## mobile-store

- Runtime adapters: `external`, `hosted`.
- Billing adapter: StoreKit or Google Play Billing.
- No local Python/TTS sidecar.

## Required Invariants

- Hosted compute must show cost/credit state before work is submitted.
- Local and external modes must remain usable without a Kengui account.
- App-store builds must not prompt users to bypass store billing for digital
  compute sold inside the app.
