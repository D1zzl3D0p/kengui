# Cloud conversion progress (#5 + #9) — design

- **Date:** 2026-08-05
- **Status:** Approved (approach + worker-side ETA)
- **Repos:** `kenkui-cloud` (control-plane projection + `kenkui-modal` worker), `kengui` (client mapping + render)
- **Related:** [[hosted-cloud-connect-state]], the interface-cleanup batch (`#4` Run-details disclosure, `#6` purged-jobs fix)

## Problem

On the hosted (Kengui Cloud) runtime, the kengui conversion progress bar never
moves (`#5`), and the run is opaque in the library (`#9`). Local runs are
unaffected.

## Root cause

kenkui's progress pipeline (`kenkui/progress.py`) emits **display-neutral
facts** — `completed_units` / `total_units` per stage and per chapter — and
deliberately never a pre-computed `percent`.

- **Local (works today):** `kenkui/services/job_executor.py::_progress_percent`
  derives percent from `completed_units/total_units`, and
  `progress_update_from_args` produces `(progress, current_chapter, eta_seconds)`
  which flow into the `QueueItem` and out through the local queue API. The kengui
  bar already renders this.
- **Cloud (broken):** the Modal worker persists the raw facts into
  `runtime_invocations.progress` via the `record_runtime_progress` RPC, but the
  status **projection** (`_shared/status_projection.ts::buildRuntimeStatusProjection`)
  reads `progress.percent` **directly** (`percent: safePercent(progress?.percent)`)
  and never derives it from units. No component writes `percent`, so the
  projection always yields `percent: null`. kengui reads
  `runtimeStatus.progress.percent ?? job.progress`; both are null/0, so the bar
  is stuck and there is no live "chapter X of Y" or ETA.

The cloud `_SemanticEventTracker` in `kenkui-modal/queue.py` tracks
`completed_units` **only for watchdog liveness** (is the worker advancing); it
does not compute or persist UI progress.

## Goal & scope

Bring hosted runs to parity with local: a **moving percent bar**, a live
**"Rendering chapter X of Y"** status line, and a worker-computed **ETA**.

**In scope**
- Derive `percent` in the projection from `completed_units/total_units`.
- Emit `chapter_index` + `chapter_total` and `eta_seconds` from the Modal worker
  into the progress payload; surface them through the projection.
- Map the new fields through the kengui cloud client and render them (bar,
  status line, ETA).
- Confirm local still renders correctly (regression check only).

**Out of scope (stays deferred to fuller #9 / #4-logs)**
- Per-chapter progress breakdown UI.
- The sanitized-logs feed (`job_events` / `worker_logs`) inside the Run-details
  disclosure.
- Analysis-stage (multi-voice character discovery) progress — that is a separate
  invocation surfaced in the wizard, not the queue bar.

## Design

Data flows worker → `record_runtime_progress` (writes
`runtime_invocations.progress` jsonb) → `buildRuntimeStatusProjection`
(control-plane read model) → `get-job` / `list-jobs` → kengui
`normalizeRuntimeStatus` / `mapCloudJob` → `Dashboard` render.

### 1. Percent — projection derivation (no worker change)

In `buildRuntimeStatusProjection`, compute `percent` when an explicit percent is
absent:

```
percent =
  safePercent(progress.percent)              // honor an explicit percent if present
  ?? deriveFromUnits(progress.completed_units, progress.total_units)
```

- `deriveFromUnits(c, t)` returns `clamp(round((c / t) * 100), 0, 100)` only when
  `t` is a finite number `> 0`; otherwise `null`.
- This is the minimal change that makes the bar move. It is covered by extending
  the existing `status_projection.test.ts`.

### 2. "Chapter X of Y" — worker payload + projection message

- **Worker (`kenkui-modal`):** where the kenkui `ProgressEvent` is translated to
  the progress payload, include, for render-stage events:
  - `chapter_total` — number of chapters actually being rendered for this job
    (the count of selected chapters the worker is iterating, **not** the book's
    absolute chapter count).
  - `chapter_index` — 1-based **ordinal position within that rendered set**
    (i.e. "the Nth chapter of `chapter_total`"), derived from how many chapters
    have started, not from a chapter's absolute parse index. This keeps
    "chapter X of Y" correct when the user rendered a chapter subset.
- **Projection:** extend `curatedProgressMessage` so that, when `chapter_index`
  and `chapter_total` are present in a render-stage payload, the message is
  `Rendering chapter {index} of {total}`. Otherwise fall back to the current
  curated stage message. Numbers only — no raw book text — preserving the
  existing redaction guarantees.

### 3. ETA — worker-side throughput (chosen)

- **Worker (`kenkui-modal`):** maintain a small throughput estimator that records
  `(monotonic_timestamp, completed_units)` samples during the render stage and
  computes `eta_seconds = round((total_units - completed_units) / rate)` where
  `rate` is units/sec over a trailing window. Emit `eta_seconds` in the progress
  payload. Emit `null` (omit) until there are enough samples for a stable rate,
  and when `total_units` is unknown.
- **Projection:** add `eta_seconds: number | null` to the `progress` projection
  object, passed through from the payload (validated: finite, `>= 0`, else null).
- **kengui:** map `runtimeStatus.progress.eta_seconds` into the existing
  `JobResponse.eta_seconds`, already rendered by `Dashboard.formatEta`.

### Schema / type changes

- **Projection output** (`status_projection.ts` `RuntimeStatusProjection.progress`):
  add `eta_seconds: number | null`. `percent` and `message` semantics change as
  above; the shape stays otherwise identical.
- **kengui `RuntimeStatus.progress`** (`api/queue.ts`): add
  `etaSeconds?: number | undefined`.
- **kengui `normalizeRuntimeStatus`** (`api/cloudQueue.ts`): project
  `eta_seconds` into `progress.etaSeconds` (validated).
- **kengui `mapCloudJob`**: set `eta_seconds` from
  `runtimeStatus.progress.etaSeconds ?? 0` (currently hardcoded `0`), and set
  `progress` from the derived percent so the non-runtime fallback also reflects
  it.
- No new SQL migration: `record_runtime_progress` already persists an arbitrary
  jsonb payload; the new keys (`chapter_index`, `chapter_total`, `eta_seconds`)
  ride inside it.

## Edge cases & error handling

- `total_units == 0` or missing → `percent = null`, `eta = null`; bar shows its
  empty/indeterminate state, status line falls back to the stage message.
- Percent is computed from the current snapshot; across a stage reset it may dip.
  Acceptable for this pass (the bar reflects render-stage completion, the long
  pole of the job). No cross-snapshot monotonic smoothing in scope.
- ETA before enough samples, or when throughput is unstable → omit ETA rather
  than show a wild number.
- Redaction: only numeric chapter counts and derived numbers are added to the
  payload/message; no raw text. Existing projection redaction tests must still
  pass.

## Testing

- **`kenkui-cloud` projection** (`status_projection.test.ts`): percent derived
  from units; explicit percent still honored; `eta_seconds` passthrough +
  validation; `Rendering chapter X of Y` message when counts present, fallback
  otherwise; `total_units == 0` → null percent/eta.
- **`kenkui-modal` worker**: unit test the throughput estimator (rate → eta,
  insufficient-samples → null) and that render payloads include
  `chapter_index`/`chapter_total`/`eta_seconds`.
- **kengui** (`cloudQueue.test.ts`): `normalizeRuntimeStatus` maps
  `eta_seconds → etaSeconds`; `mapCloudJob` sets `eta_seconds` and `progress`
  from the runtime status.
- **kengui** (`Dashboard.test.tsx`): a processing cloud job with percent + eta +
  chapter message renders a non-empty bar, the "chapter X of Y" line, and the
  ETA.

## Verification

- Automated: `npm test` (kengui) and the `kenkui-cloud` deno suite green.
- End-to-end: drive a hosted conversion and observe the bar advance, the
  "chapter X of Y" line update, and a plausible ETA; confirm a local conversion
  still renders progress (regression).
