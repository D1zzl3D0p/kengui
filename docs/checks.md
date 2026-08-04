# Checks

Run this before handing off changes:

```bash
rtk npm run check
```

The check script currently covers:

- TypeScript type checking.
- Vitest unit tests.
- Production website and desktop Vite builds.
- Rust `cargo check` for the Tauri shell.

Regenerate the server contract snapshot after changing `kenkui` routes:

```bash
rtk npm run contract:generate
```

Future additions should include Rust tests, generated TypeScript API client
drift checks, and app-store profile smoke tests.
