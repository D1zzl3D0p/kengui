# kengui App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri v2 + React + TypeScript desktop app that manages the kenkui audiobook server and provides a queue dashboard and job wizard.

**Architecture:** Tauri Rust backend spawns `kenkui serve` as a child process, watches stdout for `KENKUI_SERVER_READY`, then emits events to the React frontend. All API calls go through an abstracted client that reads the server URL from a Zustand store persisted via Tauri's store plugin — enabling future remote/orchestration server connections. v1 delivers a queue dashboard and a 4-step job wizard (book → chapters → narration → submit).

**Tech Stack:** Tauri v2, React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS v4, TanStack Query v5, Zustand v5, React Router v7, Vitest, React Testing Library

**Prerequisite:** The kenkui backend changes in `kenkui/docs/superpowers/plans/2026-04-14-kengui-prereqs.md` must be complete before running this app against a live server.

---

## File Map

### New files (kengui repo)

| File | Responsibility |
|------|---------------|
| `src-tauri/src/main.rs` | Tauri entry point |
| `src-tauri/src/lib.rs` | Rust commands: check_kenkui, spawn_server, kill_server |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `src-tauri/tauri.conf.json` | App config, permissions, plugins |
| `src/main.tsx` | React entry, QueryClient, app mount |
| `src/App.tsx` | Router + startup orchestration |
| `src/store/connection.ts` | Zustand store: serverMode, serverUrl, connectionStatus |
| `src/api/client.ts` | Base fetch wrapper (reads serverUrl from store) |
| `src/api/queue.ts` | Queue endpoint wrappers + TypeScript types |
| `src/api/books.ts` | Books endpoint wrappers + types |
| `src/api/voices.ts` | Voices endpoint wrappers + types |
| `src/components/Layout.tsx` | App shell with nav |
| `src/components/StatusBadge.tsx` | Job status colored badge |
| `src/components/ProgressBar.tsx` | Numeric progress bar |
| `src/pages/Installing.tsx` | "kenkui not found" screen with install instructions |
| `src/pages/Connecting.tsx` | "Waiting for server" spinner + error state |
| `src/pages/Dashboard.tsx` | Queue list with polling and job controls |
| `src/pages/AddJob/index.tsx` | Wizard shell with step state |
| `src/pages/AddJob/Step1Book.tsx` | File picker + book parse |
| `src/pages/AddJob/Step2Chapters.tsx` | Chapter list + filter presets |
| `src/pages/AddJob/Step3Voice.tsx` | Single/Multi toggle, voice picker |
| `src/pages/AddJob/Step4Review.tsx` | Summary card + submit |
| `src/pages/Settings.tsx` | Server mode toggle + URL input |
| `src/test/setup.ts` | Vitest globals + Tauri mocks |
| `vite.config.ts` | Vite + Tauri + Tailwind config |

---

## kenkui API Types Reference

The following TypeScript types mirror the kenkui server's Pydantic models exactly. Tasks reference these — do not redefine them.

```typescript
// From kenkui server/api.py

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface JobResponse {
  id: string;
  job: Record<string, unknown>;
  status: JobStatus;
  progress: number;       // 0.0–1.0
  current_chapter: string;
  eta_seconds: number;
  error_message: string;
  output_path: string;
  started_at: number;
  completed_at: number;
}

export interface QueueResponse {
  items: JobResponse[];
  current_item: JobResponse | null;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

export interface ChapterSummary {
  index: number;
  title: string;
  word_count: number;
  paragraph_count: number;
  toc_index: number;
  tags: Record<string, unknown>;
}

export interface BookParseResponse {
  book_hash: string;
  metadata: Record<string, unknown>;
  chapters: ChapterSummary[];
  total_chapters: number;
  total_word_count: number;
}

export type ChapterPreset = 'none' | 'content-only' | 'chapters-only' | 'with-parts' | 'manual' | 'custom';

export interface ChapterSelection {
  preset: ChapterPreset;
  included: number[];
  excluded: number[];
}

export interface ChapterFilterResponse {
  included_indices: number[];
  chapter_count: number;
  estimated_word_count: number;
  chapters: ChapterSummary[];
}

export interface VoiceResponse {
  name: string;
  source: string;
  gender: string | null;
  accent: string | null;
  dataset: string | null;
  speaker_id: string | null;
  description: string;
  display_label: string;
  excluded: boolean;
}

export interface VoiceListResponse {
  voices: VoiceResponse[];
  total: number;
}

export type NarrationMode = 'single' | 'multi';

export interface JobCreateRequest {
  ebook_path: string;
  voice: string;
  chapter_selection: ChapterSelection | null;
  narration_mode: NarrationMode;
  name: string | null;
  output_path: string | null;
  speaker_voices: Record<string, string>;
  chapter_voices: Record<string, string>;
}
```

---

### Task 1: Scaffold Project

**Files:**
- Create: all Tauri + Vite scaffold files
- Modify: `vite.config.ts`, `package.json`

- [ ] **Step 1: Initialize Tauri + React + TypeScript project**

```bash
cd /Users/dizzler/Projects/Repos/kengui
npm create tauri-app@latest . -- --template react-ts --manager npm --yes
```

If prompted about overwriting, confirm yes (directory only has `.claude/`).

- [ ] **Step 2: Install additional dependencies**

```bash
npm install @tanstack/react-query@^5 zustand@^5 react-router-dom@^7 @tauri-apps/plugin-store @tauri-apps/plugin-dialog
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Add Tauri plugins to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-store = "2"
tauri-plugin-dialog = "2"
which = "6"
```

- [ ] **Step 4: Configure Vite**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { internalIpV4 } from 'internal-ip';

const mobile = !!/android|ios/.exec(process.env.TAURI_ENV_PLATFORM ?? '');

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: mobile ? '0.0.0.0' : false,
    hmr: mobile
      ? { protocol: 'ws', host: await internalIpV4(), port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
}));
```

- [ ] **Step 5: Configure Vitest in vite.config.ts**

Add vitest config to the same `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 6: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Initialize shadcn/ui**

```bash
npx shadcn@latest init --defaults
```

When prompted:
- Style: New York
- Base color: Neutral
- CSS variables: yes

Then add the components we need:
```bash
npx shadcn@latest add button badge progress card separator input label select
```

- [ ] **Step 8: Add CSS import**

In `src/main.tsx`, ensure the CSS file is imported:
```typescript
import './App.css';
```

In `src/App.css`, replace contents with:
```css
@import "tailwindcss";
```

- [ ] **Step 9: Verify scaffold builds**

```bash
npm run build
```

Expected: build succeeds with no errors.

---

### Task 2: Test Infrastructure

**Files:**
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create Tauri mock setup**

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri core (invoke, listen, emit)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

// Mock Tauri store plugin
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve()),
      save: vi.fn(() => Promise.resolve()),
    })
  ),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));
```

- [ ] **Step 2: Verify test infrastructure**

```bash
npm test
```

Expected: 0 tests found, no errors (infrastructure is wired up).

---

### Task 3: Connection Store

**Files:**
- Create: `src/store/connection.ts`

- [ ] **Step 1: Write failing tests**

Create `src/store/connection.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConnectionStore, loadPersistedSettings } from './connection';

beforeEach(() => {
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
  });
});

describe('useConnectionStore', () => {
  it('initializes with default local mode', () => {
    const { serverMode, serverUrl, connectionStatus } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
    expect(connectionStatus).toBe('checking');
  });

  it('setConnectionStatus updates status', () => {
    useConnectionStore.getState().setConnectionStatus('connected');
    expect(useConnectionStore.getState().connectionStatus).toBe('connected');
  });
});

describe('loadPersistedSettings', () => {
  it('keeps defaults when store is empty', async () => {
    const { load } = await import('@tauri-apps/plugin-store');
    vi.mocked(load).mockResolvedValue({
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(),
      save: vi.fn(),
    } as any);

    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('local');
    expect(serverUrl).toBe('http://localhost:45365');
  });

  it('loads persisted external mode', async () => {
    const { load } = await import('@tauri-apps/plugin-store');
    vi.mocked(load).mockResolvedValue({
      get: vi.fn((key: string) => {
        if (key === 'serverMode') return Promise.resolve('external');
        if (key === 'serverUrl') return Promise.resolve('http://myserver.local:45365');
        return Promise.resolve(null);
      }),
      set: vi.fn(),
      save: vi.fn(),
    } as any);

    await loadPersistedSettings();

    const { serverMode, serverUrl } = useConnectionStore.getState();
    expect(serverMode).toBe('external');
    expect(serverUrl).toBe('http://myserver.local:45365');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/store/connection.test.ts
```

Expected: FAIL — `connection.ts` does not exist.

- [ ] **Step 3: Implement the store**

Create `src/store/connection.ts`:

```typescript
import { create } from 'zustand';
import { load } from '@tauri-apps/plugin-store';

export type ServerMode = 'local' | 'external';
export type ConnectionStatus = 'checking' | 'connected' | 'error' | 'not_found';

interface ConnectionState {
  serverMode: ServerMode;
  serverUrl: string;
  connectionStatus: ConnectionStatus;
  setServerMode: (mode: ServerMode, url?: string) => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  serverMode: 'local',
  serverUrl: 'http://localhost:45365',
  connectionStatus: 'checking',

  setServerMode: async (mode, url) => {
    const serverUrl = url ?? 'http://localhost:45365';
    const store = await load('settings.json');
    await store.set('serverMode', mode);
    await store.set('serverUrl', serverUrl);
    await store.save();
    set({ serverMode: mode, serverUrl });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));

export async function loadPersistedSettings(): Promise<void> {
  const store = await load('settings.json');
  const serverMode = (await store.get<ServerMode>('serverMode')) ?? 'local';
  const serverUrl =
    (await store.get<string>('serverUrl')) ?? 'http://localhost:45365';
  useConnectionStore.setState({ serverMode, serverUrl });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/store/connection.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/connection.ts src/store/connection.test.ts src/test/setup.ts
git commit -m "feat: add connection store with Tauri persistence"
```

---

### Task 4: API Client Layer

**Files:**
- Create: `src/api/client.ts`, `src/api/queue.ts`, `src/api/books.ts`, `src/api/voices.ts`

- [ ] **Step 1: Write failing tests**

Create `src/api/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import { apiRequest, ApiError } from './client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({ serverUrl: 'http://localhost:45365', serverMode: 'local', connectionStatus: 'checking' });
  mockFetch.mockReset();
});

describe('apiRequest', () => {
  it('uses serverUrl from store', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await apiRequest('/health');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/health',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('uses custom serverUrl when store has external URL', async () => {
    useConnectionStore.setState({ serverUrl: 'http://remote:45365', serverMode: 'external', connectionStatus: 'connected' });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await apiRequest('/health');

    expect(mockFetch).toHaveBeenCalledWith('http://remote:45365/health', expect.any(Object));
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('not found'),
    });

    await expect(apiRequest('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('ApiError carries status code', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });

    try {
      await apiRequest('/broken');
    } catch (e) {
      expect((e as ApiError).status).toBe(500);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/api/client.test.ts
```

Expected: FAIL — `client.ts` does not exist.

- [ ] **Step 3: Implement the API client**

Create `src/api/client.ts`:

```typescript
import { useConnectionStore } from '../store/connection';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const { serverUrl } = useConnectionStore.getState();
  const res = await fetch(`${serverUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/api/client.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Implement queue, books, and voices API modules**

Create `src/api/queue.ts`:

```typescript
import { apiRequest } from './client';

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface JobResponse {
  id: string;
  job: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  current_chapter: string;
  eta_seconds: number;
  error_message: string;
  output_path: string;
  started_at: number;
  completed_at: number;
}

export interface QueueResponse {
  items: JobResponse[];
  current_item: JobResponse | null;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

export type NarrationMode = 'single' | 'multi';

export interface ChapterSelection {
  preset: 'none' | 'content-only' | 'chapters-only' | 'with-parts' | 'manual';
  included: number[];
  excluded: number[];
}

export interface JobCreateRequest {
  ebook_path: string;
  voice: string;
  chapter_selection: ChapterSelection | null;
  narration_mode: NarrationMode;
  name: string | null;
  output_path: string | null;
  speaker_voices: Record<string, string>;
  chapter_voices: Record<string, string>;
}

export const fetchQueue = () => apiRequest<QueueResponse>('/queue');
export const createJob = (req: JobCreateRequest) =>
  apiRequest<JobResponse>('/queue', { method: 'POST', body: JSON.stringify(req) });
export const pauseJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/pause`, { method: 'POST' });
export const resumeJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/resume`, { method: 'POST' });
export const cancelJob = (id: string) =>
  apiRequest<void>(`/queue/${id}`, { method: 'DELETE' });
```

Create `src/api/books.ts`:

```typescript
import { apiRequest } from './client';

export interface ChapterSummary {
  index: number;
  title: string;
  word_count: number;
  paragraph_count: number;
  toc_index: number;
  tags: Record<string, unknown>;
}

export interface BookParseResponse {
  book_hash: string;
  metadata: Record<string, unknown>;
  chapters: ChapterSummary[];
  total_chapters: number;
  total_word_count: number;
}

export type ChapterPreset =
  | 'none'
  | 'content-only'
  | 'chapters-only'
  | 'with-parts'
  | 'manual'
  | 'custom';

export interface ChapterFilterResponse {
  included_indices: number[];
  chapter_count: number;
  estimated_word_count: number;
  chapters: ChapterSummary[];
}

export const parseBook = (ebook_path: string) =>
  apiRequest<BookParseResponse>('/books/parse', {
    method: 'POST',
    body: JSON.stringify({ ebook_path }),
  });

export const filterChapters = (book_hash: string, preset: ChapterPreset) =>
  apiRequest<ChapterFilterResponse>('/books/chapters/filter', {
    method: 'POST',
    body: JSON.stringify({
      book_hash,
      chapter_selection: { preset, included: [], excluded: [] },
    }),
  });
```

Create `src/api/voices.ts`:

```typescript
import { apiRequest } from './client';

export interface VoiceResponse {
  name: string;
  source: string;
  gender: string | null;
  accent: string | null;
  dataset: string | null;
  speaker_id: string | null;
  description: string;
  display_label: string;
  excluded: boolean;
}

export interface VoiceListResponse {
  voices: VoiceResponse[];
  total: number;
}

export const fetchVoices = () => apiRequest<VoiceListResponse>('/voices');
```

- [ ] **Step 6: Commit**

```bash
git add src/api/
git commit -m "feat: add API client layer for queue, books, and voices"
```

---

### Task 5: Rust Backend Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Update Cargo.toml dependencies**

In `src-tauri/Cargo.toml`, ensure `[dependencies]` contains:

```toml
tauri = { version = "2", features = [] }
tauri-plugin-store = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
which = "6"
```

- [ ] **Step 2: Implement Rust commands in lib.rs**

Replace the contents of `src-tauri/src/lib.rs`:

```rust
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct ServerProcess(pub Mutex<Option<Child>>);

#[tauri::command]
async fn check_kenkui() -> bool {
    which::which("kenkui").is_ok()
}

#[tauri::command]
async fn spawn_server(
    app: AppHandle,
    state: State<'_, ServerProcess>,
) -> Result<(), String> {
    let mut child = Command::new("kenkui")
        .arg("serve")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn kenkui: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture kenkui stdout")?;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if l.contains("KENKUI_SERVER_READY") => {
                    let _ = app_clone.emit("server-ready", ());
                    break;
                }
                Err(_) => {
                    let _ = app_clone.emit("server-error", "stdout closed unexpectedly");
                    break;
                }
                _ => {}
            }
        }
    });

    *state.0.lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
async fn kill_server(state: State<'_, ServerProcess>) -> Result<(), String> {
    let mut lock = state.0.lock().unwrap();
    if let Some(mut child) = lock.take() {
        child.kill().map_err(|e| format!("Failed to kill kenkui: {e}"))?;
        let _ = child.wait();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            check_kenkui,
            spawn_server,
            kill_server
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    let mut lock = state.0.lock().unwrap();
                    if let Some(mut child) = lock.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Ensure main.rs calls lib run()**

`src-tauri/src/main.rs` should contain:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kengui_lib::run();
}
```

The crate name in `Cargo.toml` `[lib]` section should match `kengui_lib` (Tauri scaffold sets this automatically as `<app_name>_lib`).

- [ ] **Step 4: Configure tauri.conf.json**

Replace `src-tauri/tauri.conf.json` with:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "kengui",
  "version": "0.1.0",
  "identifier": "io.kengui.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "kengui",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "store": {},
    "dialog": {}
  }
}
```

- [ ] **Step 5: Add shell permissions for spawning kenkui**

Create `src-tauri/capabilities/default.json` (if not already present from scaffold):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "store:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 6: Verify Rust compiles**

```bash
npm run tauri build -- --debug 2>&1 | head -50
```

Expected: Rust compilation succeeds (frontend build errors are acceptable at this stage — Rust is what we're verifying).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/
git commit -m "feat: add Rust backend commands for server lifecycle management"
```

---

### Task 6: Shared Components

**Files:**
- Create: `src/components/Layout.tsx`, `src/components/StatusBadge.tsx`, `src/components/ProgressBar.tsx`

- [ ] **Step 1: Write component tests**

Create `src/components/StatusBadge.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge';
import type { JobStatus } from '../api/queue';

describe('StatusBadge', () => {
  const statuses: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'paused'];

  it.each(statuses)('renders %s status', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('renders completed with green color class', () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.firstChild).toHaveClass('bg-green-100');
  });

  it('renders failed with red color class', () => {
    const { container } = render(<StatusBadge status="failed" />);
    expect(container.firstChild).toHaveClass('bg-red-100');
  });
});
```

Create `src/components/ProgressBar.test.tsx`:

```typescript
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct width for 50%', () => {
    const { container } = render(<ProgressBar value={0.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('clamps to 100% for values > 1', () => {
    const { container } = render(<ProgressBar value={1.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('clamps to 0% for negative values', () => {
    const { container } = render(<ProgressBar value={-0.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '0%' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/components/
```

Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement shared components**

Create `src/components/StatusBadge.tsx`:

```typescript
import type { JobStatus } from '../api/queue';

const statusColors: Record<JobStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  paused: 'bg-orange-100 text-orange-800',
};

interface Props {
  status: JobStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status]}`}
    >
      {status}
    </span>
  );
}
```

Create `src/components/ProgressBar.tsx`:

```typescript
interface Props {
  value: number; // 0.0–1.0
}

export function ProgressBar({ value }: Props) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="h-2 w-full rounded-full bg-gray-200">
      <div
        className="h-2 rounded-full bg-blue-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

Create `src/components/Layout.tsx`:

```typescript
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const location = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold">kengui</span>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/dashboard"
            className={location.pathname === '/dashboard' ? 'font-medium' : 'text-muted-foreground'}
          >
            Queue
          </Link>
          <Link
            to="/settings"
            className={location.pathname === '/settings' ? 'font-medium' : 'text-muted-foreground'}
          >
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/components/
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: add Layout, StatusBadge, and ProgressBar shared components"
```

---

### Task 7: App Startup Flow

**Files:**
- Modify: `src/main.tsx`, `src/App.tsx`
- Create: `src/pages/Installing.tsx`, `src/pages/Connecting.tsx`

- [ ] **Step 1: Write startup flow test**

Create `src/App.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import App from './App';
import { useConnectionStore } from './store/connection';

beforeEach(() => {
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    connectionStatus: 'checking',
  });
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockResolvedValue(() => {});
});

describe('App startup — local mode', () => {
  it('navigates to /installing when kenkui not found', async () => {
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === 'check_kenkui') return Promise.resolve(false);
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/kenkui not found/i)).toBeInTheDocument();
    });
  });

  it('invokes spawn_server when kenkui is found', async () => {
    vi.mocked(invoke).mockImplementation((cmd) => {
      if (cmd === 'check_kenkui') return Promise.resolve(true);
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('spawn_server');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL — App.tsx doesn't implement startup logic yet.

- [ ] **Step 3: Implement Installing page**

Create `src/pages/Installing.tsx`:

```typescript
export default function Installing() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-bold">kenkui not found</h1>
      <p className="max-w-md text-muted-foreground">
        kengui requires kenkui to be installed. Install it with:
      </p>
      <pre className="rounded-md bg-muted px-6 py-3 text-sm">
        uv tool install kenkui
      </pre>
      <p className="text-sm text-muted-foreground">
        Then restart kengui.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implement Connecting page**

Create `src/pages/Connecting.tsx`:

```typescript
import { useConnectionStore } from '../store/connection';

export default function Connecting() {
  const { connectionStatus } = useConnectionStore();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      {connectionStatus === 'error' ? (
        <>
          <h1 className="text-xl font-semibold text-red-600">Connection failed</h1>
          <p className="text-muted-foreground">
            Could not reach the kenkui server. Check that it is running and try again.
          </p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-muted-foreground">Starting kenkui server…</p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement App.tsx with startup logic**

Replace `src/App.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useConnectionStore, loadPersistedSettings } from './store/connection';
import Installing from './pages/Installing';
import Connecting from './pages/Connecting';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AddJob from './pages/AddJob';

const queryClient = new QueryClient();

function AppRouter() {
  const { serverMode, serverUrl, setConnectionStatus } = useConnectionStore();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadPersistedSettings().then(() => setInitialized(true));
  }, []);

  // Start connection flow once settings are loaded
  useEffect(() => {
    if (!initialized) return;

    if (serverMode === 'local') {
      invoke<boolean>('check_kenkui').then((found) => {
        if (!found) {
          setConnectionStatus('not_found');
          navigate('/installing');
          return;
        }
        setConnectionStatus('checking');
        navigate('/connecting');
        invoke('spawn_server').catch(() => setConnectionStatus('error'));
      });
    } else {
      fetch(`${serverUrl}/health`)
        .then(() => {
          setConnectionStatus('connected');
          navigate('/dashboard');
        })
        .catch(() => {
          setConnectionStatus('error');
          navigate('/connecting');
        });
    }
  }, [initialized]);

  // Listen for server lifecycle events from Rust
  useEffect(() => {
    const ready = listen('server-ready', () => {
      setConnectionStatus('connected');
      navigate('/dashboard');
    });
    const error = listen<string>('server-error', () => {
      setConnectionStatus('error');
    });
    return () => {
      ready.then((fn) => fn());
      error.then((fn) => fn());
    };
  }, []);

  return (
    <Routes>
      <Route path="/installing" element={<Installing />} />
      <Route path="/connecting" element={<Connecting />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/add/*" element={<AddJob />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Connecting />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- src/App.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/pages/Installing.tsx src/pages/Connecting.tsx
git commit -m "feat: implement app startup flow with local/external server mode"
```

---

### Task 8: Queue Dashboard

**Files:**
- Create: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/Dashboard.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as queueApi from '../api/queue';

vi.mock('../api/queue');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockJob = {
  id: 'job-1',
  job: { name: 'Test Book' },
  status: 'processing' as const,
  progress: 0.4,
  current_chapter: 'Chapter 3',
  eta_seconds: 120,
  error_message: '',
  output_path: '',
  started_at: 0,
  completed_at: 0,
};

beforeEach(() => {
  vi.mocked(queueApi.fetchQueue).mockResolvedValue({
    items: [mockJob],
    current_item: mockJob,
    pending_count: 0,
    completed_count: 0,
    failed_count: 0,
  });
});

describe('Dashboard', () => {
  it('renders job title from job.name', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Test Book')).toBeInTheDocument());
  });

  it('renders status badge', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('processing')).toBeInTheDocument());
  });

  it('shows empty state when no jobs', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/no jobs/i)).toBeInTheDocument()
    );
  });

  it('calls cancelJob on cancel click', async () => {
    vi.mocked(queueApi.cancelJob).mockResolvedValue(undefined);
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(queueApi.cancelJob).toHaveBeenCalledWith('job-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/Dashboard.test.tsx
```

Expected: FAIL — `Dashboard.tsx` does not exist.

- [ ] **Step 3: Implement Dashboard**

Create `src/pages/Dashboard.tsx`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/ui/button';
import { fetchQueue, pauseJob, resumeJob, cancelJob } from '../api/queue';
import type { JobResponse } from '../api/queue';

function formatEta(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function JobRow({ job }: { job: JobResponse }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['queue'] });

  const pause = useMutation({ mutationFn: () => pauseJob(job.id), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => resumeJob(job.id), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => cancelJob(job.id), onSuccess: invalidate });

  const name = (job.job as { name?: string }).name ?? job.id;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{name}</span>
        <StatusBadge status={job.status} />
      </div>

      {job.status === 'processing' && (
        <>
          <ProgressBar value={job.progress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{job.current_chapter}</span>
            <span>ETA: {formatEta(job.eta_seconds)}</span>
          </div>
        </>
      )}

      <div className="flex gap-2">
        {job.status === 'processing' && (
          <Button size="sm" variant="outline" onClick={() => pause.mutate()}>
            Pause
          </Button>
        )}
        {job.status === 'paused' && (
          <Button size="sm" variant="outline" onClick={() => resume.mutate()}>
            Resume
          </Button>
        )}
        {(job.status === 'pending' || job.status === 'processing' || job.status === 'paused') && (
          <Button size="sm" variant="destructive" onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['queue'],
    queryFn: fetchQueue,
    refetchInterval: 2000,
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Queue</h1>
        <Button onClick={() => navigate('/add')}>Add Book</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-red-600">Failed to load queue.</p>}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">No jobs in queue.</p>
          <Button onClick={() => navigate('/add')}>Add your first book</Button>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          {data.items.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </Layout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/pages/Dashboard.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Dashboard.test.tsx
git commit -m "feat: implement queue dashboard with polling and job controls"
```

---

### Task 9: Job Wizard Shell + Step 1 (Book)

**Files:**
- Create: `src/pages/AddJob/index.tsx`, `src/pages/AddJob/Step1Book.tsx`

Wizard state is managed in `AddJob/index.tsx` and passed down to each step. Steps call `onNext(data)` to advance.

- [ ] **Step 1: Write failing tests**

Create `src/pages/AddJob/Step1Book.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import * as booksApi from '../../api/books';
import Step1Book from './Step1Book';

vi.mock('@tauri-apps/plugin-dialog');
vi.mock('../../api/books');

const mockBook = {
  book_hash: 'abc123',
  metadata: { title: 'Dune', author: 'Herbert' },
  chapters: [{ index: 0, title: 'Chapter 1', word_count: 1000, paragraph_count: 10, toc_index: 0, tags: {} }],
  total_chapters: 1,
  total_word_count: 1000,
};

describe('Step1Book', () => {
  it('calls file dialog on button click', async () => {
    vi.mocked(open).mockResolvedValue(null);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.any(Array) })
    );
  });

  it('shows book title after parse succeeds', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByText('Dune')).toBeInTheDocument());
  });

  it('enables Next button after successful parse', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled());
  });

  it('calls onNext with book data', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => screen.getByRole('button', { name: /next/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/path/to/book.epub', book: mockBook })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/AddJob/Step1Book.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Step1Book**

Create `src/pages/AddJob/Step1Book.tsx`:

```typescript
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '../../components/ui/button';
import { parseBook } from '../../api/books';
import type { BookParseResponse } from '../../api/books';

interface Step1Data {
  filePath: string;
  book: BookParseResponse;
}

interface Props {
  onNext: (data: Step1Data) => void;
}

export default function Step1Book({ onNext }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [book, setBook] = useState<BookParseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChooseFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Ebooks', extensions: ['epub', 'mobi', 'azw', 'fb2'] }],
    });
    if (!selected || Array.isArray(selected)) return;

    setFilePath(selected);
    setBook(null);
    setError(null);
    setLoading(true);

    try {
      const parsed = await parseBook(selected);
      setBook(parsed);
    } catch {
      setError('Failed to parse ebook. Make sure the file is a valid EPUB, MOBI, AZW, or FB2.');
    } finally {
      setLoading(false);
    }
  }

  const title = book?.metadata?.title as string | undefined;
  const author = book?.metadata?.author as string | undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Choose a book</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select an EPUB, MOBI, AZW, or FB2 file to convert.
        </p>
      </div>

      <Button onClick={handleChooseFile} disabled={loading} className="w-fit">
        {loading ? 'Parsing…' : 'Choose file'}
      </Button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {book && (
        <div className="rounded-lg border p-4 flex flex-col gap-1">
          {title && <p className="font-medium text-lg">{title}</p>}
          {author && <p className="text-muted-foreground text-sm">{author}</p>}
          <p className="text-sm mt-2">
            {book.total_chapters} chapters · {book.total_word_count.toLocaleString()} words
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!book}
          onClick={() => book && filePath && onNext({ filePath, book })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement Wizard Shell**

Create `src/pages/AddJob/index.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import Step1Book from './Step1Book';
import Step2Chapters from './Step2Chapters';
import Step3Voice from './Step3Voice';
import Step4Review from './Step4Review';
import type { BookParseResponse, ChapterPreset } from '../../api/books';
import type { NarrationMode } from '../../api/queue';

export interface WizardState {
  filePath: string;
  book: BookParseResponse;
  chapterPreset: ChapterPreset;
  narrationMode: NarrationMode;
  voice: string;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Book', 'Chapters', 'Narration', 'Review'];

export default function AddJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<Partial<WizardState>>({});

  function StepIndicator() {
    return (
      <div className="flex gap-2 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                i + 1 === step
                  ? 'bg-primary text-primary-foreground'
                  : i + 1 < step
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="text-sm text-muted-foreground">{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <span className="text-muted-foreground">→</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Add Book</h1>
        <StepIndicator />

        {step === 1 && (
          <Step1Book
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(2);
            }}
          />
        )}
        {step === 2 && state.book && state.filePath && (
          <Step2Chapters
            book={state.book}
            onBack={() => setStep(1)}
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <Step3Voice
            onBack={() => setStep(2)}
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(4);
            }}
          />
        )}
        {step === 4 && state.filePath && state.book && state.chapterPreset && state.narrationMode && state.voice && (
          <Step4Review
            wizardState={state as WizardState}
            onBack={() => setStep(3)}
            onDone={() => navigate('/dashboard')}
          />
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- src/pages/AddJob/Step1Book.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AddJob/
git commit -m "feat: add wizard shell and Step 1 (book file picker + parse)"
```

---

### Task 10: Wizard Step 2 — Chapters

**Files:**
- Create: `src/pages/AddJob/Step2Chapters.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/AddJob/Step2Chapters.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as booksApi from '../../api/books';
import Step2Chapters from './Step2Chapters';
import type { BookParseResponse } from '../../api/books';

vi.mock('../../api/books');

const mockBook: BookParseResponse = {
  book_hash: 'abc123',
  metadata: { title: 'Dune' },
  chapters: [
    { index: 0, title: 'Preface', word_count: 200, paragraph_count: 2, toc_index: 0, tags: {} },
    { index: 1, title: 'Chapter 1', word_count: 3000, paragraph_count: 30, toc_index: 1, tags: {} },
    { index: 2, title: 'Chapter 2', word_count: 2500, paragraph_count: 25, toc_index: 2, tags: {} },
  ],
  total_chapters: 3,
  total_word_count: 5700,
};

const filterResult = {
  included_indices: [1, 2],
  chapter_count: 2,
  estimated_word_count: 5500,
  chapters: [mockBook.chapters[1], mockBook.chapters[2]],
};

beforeEach(() => {
  vi.mocked(booksApi.filterChapters).mockResolvedValue(filterResult);
});

describe('Step2Chapters', () => {
  it('renders all chapters', () => {
    const onNext = vi.fn();
    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={onNext} />);
    expect(screen.getByText('Preface')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
  });

  it('calls filterChapters when preset changes', async () => {
    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={vi.fn()} />);
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'content-only');
    await waitFor(() => expect(booksApi.filterChapters).toHaveBeenCalledWith('abc123', 'content-only'));
  });

  it('calls onNext with selected preset', async () => {
    const onNext = vi.fn();
    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ chapterPreset: expect.any(String) }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/AddJob/Step2Chapters.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Step2Chapters**

Create `src/pages/AddJob/Step2Chapters.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { filterChapters } from '../../api/books';
import type { BookParseResponse, ChapterPreset, ChapterSummary } from '../../api/books';

const PRESETS: { value: ChapterPreset; label: string }[] = [
  { value: 'content-only', label: 'Content only (recommended)' },
  { value: 'chapters-only', label: 'Chapters only' },
  { value: 'with-parts', label: 'With parts' },
  { value: 'none', label: 'None' },
];

interface Step2Data {
  chapterPreset: ChapterPreset;
}

interface Props {
  book: BookParseResponse;
  onBack: () => void;
  onNext: (data: Step2Data) => void;
}

export default function Step2Chapters({ book, onBack, onNext }: Props) {
  const [preset, setPreset] = useState<ChapterPreset>('content-only');
  const [filtered, setFiltered] = useState<ChapterSummary[]>(book.chapters);
  const [wordCount, setWordCount] = useState(book.total_word_count);

  useEffect(() => {
    filterChapters(book.book_hash, preset).then((res) => {
      setFiltered(res.chapters);
      setWordCount(res.estimated_word_count);
    });
  }, [preset, book.book_hash]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Select chapters</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Choose which chapters to include in the audiobook.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="preset-select">
          Filter preset
        </label>
        <select
          id="preset-select"
          className="rounded-md border px-3 py-2 text-sm"
          value={preset}
          onChange={(e) => setPreset(e.target.value as ChapterPreset)}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
        {filtered.map((ch) => (
          <div key={ch.index} className="flex justify-between px-3 py-2 text-sm">
            <span>{ch.title || `Chapter ${ch.index + 1}`}</span>
            <span className="text-muted-foreground">{ch.word_count.toLocaleString()} words</span>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} chapters · {wordCount.toLocaleString()} words
      </p>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={() => onNext({ chapterPreset: preset })}>Next</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/pages/AddJob/Step2Chapters.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AddJob/Step2Chapters.tsx src/pages/AddJob/Step2Chapters.test.tsx
git commit -m "feat: add wizard Step 2 (chapter filter presets)"
```

---

### Task 11: Wizard Step 3 — Narration & Voice

**Files:**
- Create: `src/pages/AddJob/Step3Voice.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/AddJob/Step3Voice.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as voicesApi from '../../api/voices';
import Step3Voice from './Step3Voice';

vi.mock('../../api/voices');

const mockVoices = [
  { name: 'alba', display_label: 'Alba', gender: 'female', accent: 'british', source: '', dataset: null, speaker_id: null, description: '', excluded: false },
  { name: 'leo', display_label: 'Leo', gender: 'male', accent: 'american', source: '', dataset: null, speaker_id: null, description: '', excluded: false },
];

beforeEach(() => {
  vi.mocked(voicesApi.fetchVoices).mockResolvedValue({ voices: mockVoices, total: 2 });
});

function renderStep(onNext = vi.fn(), onBack = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Step3Voice onNext={onNext} onBack={onBack} />
    </QueryClientProvider>
  );
}

describe('Step3Voice', () => {
  it('renders single voice mode by default', async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText('Single Voice')).toBeInTheDocument());
  });

  it('shows voice list in single mode', async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText('Alba')).toBeInTheDocument());
  });

  it('shows NLP options when multi-voice is selected', async () => {
    renderStep();
    await waitFor(() => screen.getByText('Multi-Voice'));
    await userEvent.click(screen.getByLabelText('Multi-Voice'));
    expect(screen.getByText(/BookNLP/i)).toBeInTheDocument();
  });

  it('calls onNext with single mode voice', async () => {
    const onNext = vi.fn();
    renderStep(onNext);
    await waitFor(() => screen.getByText('Alba'));
    await userEvent.click(screen.getByLabelText('alba'));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ narrationMode: 'single', voice: 'alba' })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/AddJob/Step3Voice.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Step3Voice**

Create `src/pages/AddJob/Step3Voice.tsx`:

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { fetchVoices } from '../../api/voices';
import type { NarrationMode } from '../../api/queue';

interface Step3Data {
  narrationMode: NarrationMode;
  voice: string;
}

interface Props {
  onBack: () => void;
  onNext: (data: Step3Data) => void;
}

const NLP_MODES = [
  { value: 'booknlp', label: 'BookNLP (fast, ~30s)' },
  { value: 'ollama', label: 'Ollama LLM (accurate, ~2-5min)' },
];

export default function Step3Voice({ onBack, onNext }: Props) {
  const [narrationMode, setNarrationMode] = useState<NarrationMode>('single');
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [nlpMode, setNlpMode] = useState<string>('booknlp');
  const [search, setSearch] = useState('');

  const { data: voiceData, isLoading } = useQuery({
    queryKey: ['voices'],
    queryFn: fetchVoices,
  });

  const voices = (voiceData?.voices ?? []).filter(
    (v) =>
      !v.excluded &&
      (search === '' ||
        v.display_label.toLowerCase().includes(search.toLowerCase()) ||
        (v.gender ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (v.accent ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const canProceed =
    narrationMode === 'multi' || selectedVoice !== '';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Narration</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Choose between a single narrator or multi-voice with character detection.
        </p>
      </div>

      <div className="flex gap-4">
        {(['single', 'multi'] as NarrationMode[]).map((mode) => (
          <label key={mode} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="narrationMode"
              value={mode}
              aria-label={mode === 'single' ? 'Single Voice' : 'Multi-Voice'}
              checked={narrationMode === mode}
              onChange={() => setNarrationMode(mode)}
            />
            <span className="font-medium">
              {mode === 'single' ? 'Single Voice' : 'Multi-Voice'}
            </span>
          </label>
        ))}
      </div>

      {narrationMode === 'single' && (
        <div className="flex flex-col gap-3">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Search voices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isLoading && <p className="text-muted-foreground text-sm">Loading voices…</p>}
          <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
            {voices.map((v) => (
              <label
                key={v.name}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="radio"
                  name="voice"
                  value={v.name}
                  aria-label={v.name}
                  checked={selectedVoice === v.name}
                  onChange={() => setSelectedVoice(v.name)}
                />
                <span className="font-medium text-sm">{v.display_label}</span>
                {v.gender && (
                  <span className="text-xs text-muted-foreground">{v.gender}</span>
                )}
                {v.accent && (
                  <span className="text-xs text-muted-foreground">{v.accent}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {narrationMode === 'multi' && (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <p className="text-sm font-medium">NLP character detection</p>
          <p className="text-xs text-muted-foreground">
            kenkui will scan the book for characters and auto-assign voices by gender.
          </p>
          <div className="flex flex-col gap-2">
            {NLP_MODES.map((m) => (
              <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nlpMode"
                  value={m.value}
                  checked={nlpMode === m.value}
                  onChange={() => setNlpMode(m.value)}
                />
                <span className="text-sm">{m.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button
          disabled={!canProceed}
          onClick={() =>
            onNext({
              narrationMode,
              voice: narrationMode === 'single' ? selectedVoice : 'alba',
            })
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/pages/AddJob/Step3Voice.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AddJob/Step3Voice.tsx src/pages/AddJob/Step3Voice.test.tsx
git commit -m "feat: add wizard Step 3 (narration mode and voice selection)"
```

---

### Task 12: Wizard Step 4 — Review & Submit

**Files:**
- Create: `src/pages/AddJob/Step4Review.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/AddJob/Step4Review.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as queueApi from '../../api/queue';
import Step4Review from './Step4Review';
import type { WizardState } from './index';

vi.mock('../../api/queue');

const wizardState: WizardState = {
  filePath: '/books/dune.epub',
  book: {
    book_hash: 'abc123',
    metadata: { title: 'Dune', author: 'Frank Herbert' },
    chapters: [],
    total_chapters: 42,
    total_word_count: 188000,
  },
  chapterPreset: 'content-only',
  narrationMode: 'single',
  voice: 'alba',
};

function renderStep(onDone = vi.fn()) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Step4Review wizardState={wizardState} onBack={vi.fn()} onDone={onDone} />
    </QueryClientProvider>
  );
}

describe('Step4Review', () => {
  it('shows book title in summary', () => {
    renderStep();
    expect(screen.getByText('Dune')).toBeInTheDocument();
  });

  it('shows selected voice', () => {
    renderStep();
    expect(screen.getByText('alba')).toBeInTheDocument();
  });

  it('shows narration mode', () => {
    renderStep();
    expect(screen.getByText('single')).toBeInTheDocument();
  });

  it('calls createJob and onDone on submit', async () => {
    vi.mocked(queueApi.createJob).mockResolvedValue({
      id: 'new-job',
      job: {},
      status: 'pending',
      progress: 0,
      current_chapter: '',
      eta_seconds: 0,
      error_message: '',
      output_path: '',
      started_at: 0,
      completed_at: 0,
    });
    const onDone = vi.fn();
    renderStep(onDone);

    await userEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(queueApi.createJob).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/AddJob/Step4Review.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Step4Review**

Create `src/pages/AddJob/Step4Review.tsx`:

```typescript
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { createJob } from '../../api/queue';
import type { WizardState } from './index';

interface Props {
  wizardState: WizardState;
  onBack: () => void;
  onDone: () => void;
}

export default function Step4Review({ wizardState, onBack, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);

  const { book, filePath, chapterPreset, narrationMode, voice } = wizardState;
  const title = book.metadata?.title as string | undefined;
  const author = book.metadata?.author as string | undefined;

  const submit = useMutation({
    mutationFn: () =>
      createJob({
        ebook_path: filePath,
        voice,
        chapter_selection: {
          preset: chapterPreset,
          included: [],
          excluded: [],
        },
        narration_mode: narrationMode,
        name: title ?? null,
        output_path: null,
        speaker_voices: {},
        chapter_voices: {},
      }),
    onSuccess: () => onDone(),
    onError: (e: Error) => setError(e.message),
  });

  const rows = [
    { label: 'Book', value: title ?? filePath },
    { label: 'Author', value: author ?? '—' },
    { label: 'Chapters', value: chapterPreset },
    { label: 'Narration', value: narrationMode },
    { label: 'Voice', value: voice },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Review & Start</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Review your settings and start the conversion.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={submit.isPending}>
          Back
        </Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? 'Starting…' : 'Start conversion'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/pages/AddJob/Step4Review.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AddJob/Step4Review.tsx src/pages/AddJob/Step4Review.test.tsx
git commit -m "feat: add wizard Step 4 (review and job submission)"
```

---

### Task 13: Settings Panel

**Files:**
- Create: `src/pages/Settings.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/pages/Settings.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useConnectionStore } from '../store/connection';
import Settings from './Settings';

vi.mock('../store/connection', async () => {
  const actual = await vi.importActual('../store/connection');
  return {
    ...actual,
    useConnectionStore: vi.fn(),
  };
});

describe('Settings', () => {
  it('shows local mode as selected by default', () => {
    vi.mocked(useConnectionStore).mockReturnValue({
      serverMode: 'local',
      serverUrl: 'http://localhost:45365',
      connectionStatus: 'connected',
      setServerMode: vi.fn(),
      setConnectionStatus: vi.fn(),
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByLabelText(/local/i)).toBeChecked();
  });

  it('shows URL input when external mode is selected', async () => {
    const setServerMode = vi.fn();
    vi.mocked(useConnectionStore).mockReturnValue({
      serverMode: 'local',
      serverUrl: 'http://localhost:45365',
      connectionStatus: 'connected',
      setServerMode,
      setConnectionStatus: vi.fn(),
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);
    await userEvent.click(screen.getByLabelText(/external/i));
    expect(screen.getByPlaceholderText(/http/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/pages/Settings.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement Settings**

Create `src/pages/Settings.tsx`:

```typescript
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';

export default function Settings() {
  const { serverMode, serverUrl, setServerMode } = useConnectionStore();
  const [localMode, setLocalMode] = useState<ServerMode>(serverMode);
  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await setServerMode(localMode, localUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout>
      <div className="max-w-lg flex flex-col gap-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Server</h2>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="serverMode"
                value="local"
                aria-label="Local (managed)"
                checked={localMode === 'local'}
                onChange={() => setLocalMode('local')}
              />
              <div>
                <p className="font-medium text-sm">Local (managed)</p>
                <p className="text-xs text-muted-foreground">
                  kengui starts and manages kenkui automatically.
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="serverMode"
                value="external"
                aria-label="External server"
                checked={localMode === 'external'}
                onChange={() => setLocalMode('external')}
              />
              <div>
                <p className="font-medium text-sm">External server</p>
                <p className="text-xs text-muted-foreground">
                  Connect to a remote or manually-started kenkui server.
                </p>
              </div>
            </label>
          </div>

          {localMode === 'external' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="server-url">
                Server URL
              </label>
              <input
                id="server-url"
                type="url"
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="http://my-server.local:45365"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
              />
            </div>
          )}

          <Button className="w-fit" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save settings'}
          </Button>

          {localMode !== serverMode && (
            <p className="text-xs text-muted-foreground">
              Changes take effect after restarting kengui.
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/pages/Settings.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Settings.test.tsx
git commit -m "feat: add settings panel with server mode toggle"
```

---

### Task 14: Full Test Suite + End-to-End Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Note any failures and fix before proceeding.

- [ ] **Step 2: Build for production**

```bash
npm run tauri build -- --debug
```

Expected: Build succeeds. Binary produced in `src-tauri/target/debug/`.

- [ ] **Step 3: Smoke test — local mode**

```bash
# Prerequisites:
# 1. kenkui installed: which kenkui
# 2. kenkui prereqs applied (CORS + ready signal)

npm run tauri dev
```

Verify:
- App launches and shows the Connecting screen
- Dashboard appears within ~5 seconds
- "Add Book" button opens the wizard
- File picker works (choose any EPUB)
- Book title/author appear after parse
- Chapter list loads with presets
- Voice list loads in Step 3
- Submitting creates a job visible in the dashboard

- [ ] **Step 4: Smoke test — external mode**

In Settings, switch to External mode with URL `http://localhost:45365` (assuming a manually started kenkui server). Restart the app. Verify it connects without spawning a new process.

- [ ] **Step 5: Verify server process cleanup**

```bash
# In one terminal, run the app:
npm run tauri dev

# In another terminal, watch for kenkui:
watch -n1 'ps aux | grep "kenkui serve" | grep -v grep'

# Quit the app — verify kenkui process disappears within 2 seconds
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: complete kengui v0.1.0 implementation"
```

---

## Verification Summary

| Check | Command | Expected |
|-------|---------|----------|
| All tests pass | `npm test` | 0 failures |
| Dev build | `npm run tauri dev` | App launches |
| kenkui spawned | `ps aux \| grep kenkui` | Process appears |
| Queue dashboard loads | (visual) | Jobs list or empty state |
| Wizard end-to-end | (visual) | Job submitted, visible in queue |
| Process cleanup | (visual + ps) | kenkui killed on app quit |
| External mode | Settings → External | Connects to URL |
