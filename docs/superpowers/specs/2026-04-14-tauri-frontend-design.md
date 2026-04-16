# kengui: Tauri + React Frontend Design Spec

**Date:** 2026-04-14
**Status:** Approved

---

## Overview

kengui is a cross-platform desktop GUI for kenkui — a Python/FastAPI ebook-to-audiobook converter. kengui manages the kenkui server as a local subprocess and provides a React-based UI for the core audiobook conversion workflow. It can also connect to a remote kenkui server for future orchestration use cases.

**Primary targets:** macOS, Linux, Windows
**Future targets:** iOS, Android (architecture is mobile-ready)

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Shell | Tauri v2 | Cross-platform, Rust backend, mobile-ready |
| Frontend | React 18 + TypeScript | Best AI tooling support, largest ecosystem |
| Build | Vite | Tauri default, fast HMR |
| Components | shadcn/ui + Tailwind CSS | AI-friendly, headless, well-documented |
| Server state | TanStack Query | Polling, caching, refetch intervals |
| Client state | Zustand | Minimal, persistent via Tauri store |
| Routing | React Router v7 | Standard React routing |

---

## Architecture

### Repo Relationship

```
kenkui/   ← Python backend (FastAPI server, audiobook processing)
kengui/   ← This repo (Tauri app, React frontend)
```

kengui is a standalone repo. It does not modify kenkui internals — it communicates exclusively via kenkui's REST API.

### Connection Model

**Local mode (default):** Tauri Rust backend spawns `kenkui serve` as a child process on app launch. Watches stdout for `KENKUI_SERVER_READY` signal, then loads the dashboard. Kills the process on app exit.

**External mode:** User configures a custom server URL in settings. App connects directly without spawning anything locally. Enables future remote orchestration server use case.

**Startup flow:**
```
App mounts
  ├─ local mode:
  │    check_kenkui() in PATH?
  │      no  → <Installing />  (show install instructions)
  │      yes → spawn_server()
  │              server-ready event → /dashboard
  │              server-error event → error state + retry
  └─ external mode:
       GET /health at stored URL
         ok   → /dashboard
         fail → <Connecting /> with error + retry
```

---

## kenkui Backend Prerequisites

Two changes required in kenkui before kengui implementation:

### 1. CORS Middleware (blocking)

**File:** `src/kenkui/server/api.py`

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://tauri.localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. Stdout Ready Signal (blocking)

**File:** `src/kenkui/server/server.py`

Print to stdout after Uvicorn is accepting connections:
```
KENKUI_SERVER_READY
```

### 3. Configurable Bind Address (non-blocking)

Allow `kenkui serve --host 0.0.0.0` for remote deployment. Defaults to `127.0.0.1`.

---

## Directory Structure

```
kengui/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             # App entry
│   │   └── lib.rs              # Tauri commands: check_kenkui, spawn_server, kill_server
│   ├── Cargo.toml
│   └── tauri.conf.json         # productName: kengui, plugins: shell, store, dialog
├── src/
│   ├── api/
│   │   ├── client.ts           # Base fetch — reads serverUrl from store, never hardcoded
│   │   ├── queue.ts            # /queue endpoints
│   │   ├── books.ts            # /books/parse, /books/chapters/filter
│   │   └── voices.ts           # GET /voices
│   ├── store/
│   │   └── connection.ts       # Zustand: serverMode, serverUrl, connectionStatus
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── StatusBadge.tsx
│   │   └── ProgressBar.tsx
│   ├── pages/
│   │   ├── Installing.tsx      # kenkui not found screen
│   │   ├── Connecting.tsx      # Waiting for server ready
│   │   ├── Dashboard.tsx       # Queue dashboard (main view)
│   │   └── AddJob/
│   │       ├── index.tsx       # Wizard shell
│   │       ├── Step1Book.tsx   # File picker + parse
│   │       ├── Step2Chapters.tsx
│   │       ├── Step3Voice.tsx  # Single / Multi-Voice toggle
│   │       └── Step4Review.tsx # Summary + submit
│   ├── App.tsx                 # Router + startup logic
│   └── main.tsx
└── package.json
```

---

## Rust Backend (src-tauri/src/lib.rs)

```rust
// Check if `kenkui` binary is in PATH
#[tauri::command]
async fn check_kenkui() -> bool

// Spawn `kenkui serve`, emit server-ready / server-error events
#[tauri::command]
async fn spawn_server(app: AppHandle) -> Result<(), String>

// Kill the managed process
#[tauri::command]
async fn kill_server() -> Result<(), String>
```

Process handle stored in `Mutex<Option<Child>>` in Tauri state. Kill on `window-close` event.

---

## v1 Feature Scope

### Queue Dashboard
- Live job list polling every 2s via TanStack Query
- Columns: title, status badge, progress bar, ETA
- Per-job actions: pause, resume, cancel
- "Add Book" button → wizard
- Empty state with prompt

### Job Wizard (4 steps)

**Step 1 — Book**
Native file picker (`.epub .mobi .azw .fb2`) → `POST /books/parse` → show title, author, chapter count

**Step 2 — Chapters**
Chapter list with filter preset selector (content-only / chapters-only / with-parts / all / none) → `POST /books/chapters/filter` to preview

**Step 3 — Narration**
Toggle: Single Voice / Multi-Voice
- Single: searchable voice dropdown from `GET /voices` (filter by gender, accent)
- Multi: NLP mode selector (BookNLP / Ollama LLM) + auto gender-pool voice assignment; show Ollama time estimate

**Step 4 — Review & Submit**
Summary card → `POST /queue` → navigate to dashboard on success

### Settings Panel
Gear icon on dashboard. Switch between Local (managed) and External (custom URL) modes. Persisted via Tauri store.

---

## Out of Scope (v1)

- Per-character manual voice assignment
- Voice browser / audition
- Config editor
- Series management
- Push notifications
- SSE / WebSocket (polling only for v1)

---

## API Surface Used

All endpoints exist in kenkui v1.2.0:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Connection check |
| GET | `/queue` | Dashboard poll |
| POST | `/queue` | Submit job |
| DELETE | `/queue/:id` | Cancel |
| POST | `/queue/:id/pause` | Pause |
| POST | `/queue/:id/resume` | Resume |
| POST | `/books/parse` | Parse ebook |
| POST | `/books/chapters/filter` | Filter chapters |
| GET | `/voices` | List voices |

---

## Future-Proofing

- `serverUrl` always from store, never hardcoded → remote server is a config change
- `ServerMode` type is extensible (`'local' | 'external'` → add `'remote'` with auth later)
- Tauri v2 mobile support: iOS/Android targets can be added without restructuring
- Per-character voice assignment: add Step 3b to wizard, no architecture change needed
- Sidecar bundling (PyInstaller/uv): additive to current Rust spawn approach

---

## Verification

### kenkui prerequisites
```bash
# After CORS patch: verify no CORS error from Tauri origin
curl -H "Origin: tauri://localhost" http://localhost:45365/health

# After ready signal: confirm token in stdout
kenkui serve 2>&1 | grep KENKUI_SERVER_READY
```

### kengui end-to-end
1. `npm run tauri dev` → app launches, server spawns, Dashboard loads
2. Add EPUB via wizard → job appears with PENDING status
3. Watch queue poll → status updates as job processes
4. Pause/resume/cancel → state reflects in UI
5. Settings → External mode → enter URL → connects
6. Quit app → `ps aux | grep kenkui` shows process is gone
