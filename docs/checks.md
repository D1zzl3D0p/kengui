# Checks

Run this before handing off changes:

```bash
rtk npm run check
```

The check script currently covers:

- TypeScript type checking.
- Vitest unit tests.
- Production Vite build.
- Rust `cargo check` for the Tauri shell.

Regenerate the server contract snapshot after changing `kenkui` routes:

```bash
rtk npm run contract:openapi
```

Future additions should include Rust tests, generated TypeScript API client
drift checks, and app-store profile smoke tests.
