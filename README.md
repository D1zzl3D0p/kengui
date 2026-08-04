# Kengui

Kengui is the web and Tauri GUI client for the `kenkui` audiobook generation
ecosystem. The website and desktop application are thin platform shells around
one shared React application and a versioned `kenkui` API.

## Product Boundary

- `kenkui` owns ebook parsing, NLP, voice selection, rendering, and
  post-processing, HTTP routes, queueing, worker execution, hosted compute, and
  OpenAPI.
- `kengui` owns UI workflows, runtime selection, Tauri process supervision, and
  app-store billing adapters.

## Runtime Modes

- `local`: desktop-managed `kenkui serve` sidecar.
- `external`: user-supplied or self-hosted server URL.
- `hosted`: Kengui-operated compute service for store builds.

## Development

The repository is organized as:

- `apps/web`: website entry point and Vite configuration.
- `apps/desktop`: desktop entry point and Tauri/Rust shell.
- `packages/app`: shared application behavior.
- `packages/platform`: browser/native capability adapters.
- `packages/ui`: shared visual primitives.

```bash
rtk npm install
rtk npm run dev:web
rtk npm run tauri -- dev
```

Run the full local gate before handing off changes:

```bash
rtk npm run check
```

## Desktop Distribution

See [`docs/desktop-distribution.md`](docs/desktop-distribution.md) for local
desktop bundle builds, the GitHub release workflow, signing/notarization
secrets, and the app-store readiness checklist.

## Cloud Auth

See [`docs/cloud-auth.md`](docs/cloud-auth.md) for Supabase and GitHub OAuth
callback setup.

## Licensing

Kengui is MIT licensed. The commercial boundary is the operated hosted compute
service, not the source code.
