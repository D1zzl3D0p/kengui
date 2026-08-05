# Cloud Conversion Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hosted (Kengui Cloud) conversion queue show a moving percent bar, a "Rendering chapter X of Y" status line, and a worker-computed ETA — matching what local already does.

**Architecture:** kenkui's render engine already emits display-neutral facts (`completed_units`/`total_units`/`timestamp`/`active_chapters`) that the Modal worker serializes into `runtime_invocations.progress`. We (1) derive `percent` in the control-plane status projection from those units, (2) compute `eta_seconds` in the Modal worker from the events' monotonic timestamps, (3) thread `total_chapters` + a rendered `chapter_ordinal` through kenkui so the projection can build the "chapter X of Y" message, and (4) pass the projection's ETA + curated message through the kengui cloud client to the existing Dashboard render.

**Tech Stack:** Deno/TypeScript (kenkui-cloud control-plane edge functions), Python (kenkui render engine + kenkui-modal worker), React/TypeScript + Vitest (kengui).

## Global Constraints

- No new SQL migration. New payload keys (`eta_seconds`, `total_chapters`, `chapter_ordinal`) ride inside the existing `runtime_invocations.progress` jsonb written by `record_runtime_progress`.
- Projection stays operator-safe: only numbers and allowlisted message strings are surfaced; never raw book text or raw worker errors.
- Percent is an integer 0–100. ETA is integer seconds ≥ 0, omitted (null) when not confidently known.
- kenkui `ProgressEvent` field additions must be backward compatible (new fields with defaults; local path unaffected).
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Repos & branches: kengui on `cloud-conversion-progress`; kenkui-cloud and kenkui each commit on a matching feature branch created at task start (`git checkout -b cloud-conversion-progress`).

---

### Task 1: Projection derives percent from units + passes ETA through

**Files:**
- Modify: `kenkui-cloud/services/control-plane/supabase/functions/_shared/status_projection.ts` (add helpers near `safePercent` ~line 325; extend `RuntimeStatusProjection.progress` ~line 43; use in `buildRuntimeStatusProjection` ~line 224)
- Test: `kenkui-cloud/services/control-plane/supabase/functions/_shared/status_projection.test.ts`

**Interfaces:**
- Produces: `RuntimeStatusProjection.progress` now includes `eta_seconds: number | null`, and its `percent` is derived from `completed_units`/`total_units` when no explicit `percent` is present.

- [ ] **Step 1: Write the failing tests**

Add to `status_projection.test.ts`:

```ts
Deno.test("progress percent derives from completed/total units when percent absent", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { stage: "tts_synthesis", completed_units: 520, total_units: 1000 },
  });
  assertEquals(p.progress.percent, 52);
});

Deno.test("progress percent honors an explicit percent over units", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { percent: 40, completed_units: 999, total_units: 1000 },
  });
  assertEquals(p.progress.percent, 40);
});

Deno.test("progress percent is null when total_units is zero", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { completed_units: 10, total_units: 0 },
  });
  assertEquals(p.progress.percent, null);
});

Deno.test("progress eta_seconds passes through, rounded and validated", () => {
  const ok = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running", progress: { eta_seconds: 182.6 },
  });
  assertEquals(ok.progress.eta_seconds, 183);
  const bad = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running", progress: { eta_seconds: -5 },
  });
  assertEquals(bad.progress.eta_seconds, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd kenkui-cloud && deno test --allow-env --config services/control-plane/supabase/deno.json services/control-plane/supabase/functions/_shared/status_projection.test.ts`
Expected: FAIL — `percent` is `null` for the units case; `eta_seconds` is not a property of `progress`.

- [ ] **Step 3: Implement the derivation + field**

In `status_projection.ts`, add helpers next to `safePercent`:

```ts
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function derivedPercent(progress: Record<string, unknown> | null): number | null {
  const explicit = safePercent(progress?.percent);
  if (explicit !== null) return explicit;
  const completed = finiteNumber(progress?.completed_units);
  const total = finiteNumber(progress?.total_units);
  if (completed === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function safeEtaSeconds(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? Math.round(n) : null;
}
```

Add `eta_seconds: number | null;` to the `progress` object in `interface RuntimeStatusProjection` (after `age_seconds`). In `buildRuntimeStatusProjection`, replace the `percent` line and add eta in the returned `progress`:

```ts
    progress: {
      stage: progressStage,
      percent: derivedPercent(progress),
      message: curatedProgressMessage(progress?.event, progressStage),
      updated_at: progressAt,
      age_seconds: ageSeconds(progressAt, now),
      eta_seconds: safeEtaSeconds(progress?.eta_seconds),
    },
```

(`progress` is already `objectValue(source?.progress)` at ~line 207.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd kenkui-cloud && deno test --allow-env --config services/control-plane/supabase/deno.json services/control-plane/supabase/functions/_shared/status_projection.test.ts`
Expected: PASS (existing projection tests still green).

- [ ] **Step 5: Commit**

```bash
cd kenkui-cloud
git add services/control-plane/supabase/functions/_shared/status_projection.ts services/control-plane/supabase/functions/_shared/status_projection.test.ts
git commit -m "feat(projection): derive progress percent from units and surface eta_seconds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Projection builds the "Rendering chapter X of Y" message

**Files:**
- Modify: `kenkui-cloud/services/control-plane/supabase/functions/_shared/status_projection.ts` (`curatedProgressMessage` ~line 347; its call site ~line 225)
- Test: `kenkui-cloud/services/control-plane/supabase/functions/_shared/status_projection.test.ts`

**Interfaces:**
- Consumes: render payloads may carry `event: "render_progress"`, `chapter_ordinal: number`, `total_chapters: number` (emitted by Task 5).
- Produces: `progress.message` is `Rendering chapter {ordinal} of {total}` for render progress with valid counts; otherwise the existing allowlisted event/stage message.

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test("render progress message shows chapter X of Y when counts present", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { event: "render_progress", stage: "tts_synthesis", chapter_ordinal: 14, total_chapters: 27 },
  });
  assertEquals(p.progress.message, "Rendering chapter 14 of 27");
});

Deno.test("render progress falls back to the generic message without counts", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { event: "render_progress", stage: "tts_synthesis" },
  });
  assertEquals(p.progress.message, "Rendering audiobook");
});

Deno.test("chapter counts are ignored for non-render events", () => {
  const p = buildRuntimeStatusProjection({
    invocation_id: "i", status: "running",
    progress: { event: "nlp_extraction", chapter_ordinal: 3, total_chapters: 9 },
  });
  assertEquals(p.progress.message, "Extracting book structure");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd kenkui-cloud && deno test --allow-env --config services/control-plane/supabase/deno.json services/control-plane/supabase/functions/_shared/status_projection.test.ts`
Expected: FAIL — first test gets "Rendering audiobook" instead of "Rendering chapter 14 of 27".

- [ ] **Step 3: Implement the message**

Change `curatedProgressMessage` to take the whole progress object and build the render message. Add a helper:

```ts
function positiveIntOrNull(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

function curatedProgressMessage(
  progress: Record<string, unknown> | null,
  stage: string | null,
): string | null {
  const event = progress?.event;
  if (event === "render_progress") {
    const ordinal = positiveIntOrNull(progress?.chapter_ordinal);
    const total = positiveIntOrNull(progress?.total_chapters);
    if (ordinal !== null && total !== null && ordinal <= total) {
      return `Rendering chapter ${ordinal} of ${total}`;
    }
  }
  if (typeof event === "string" && Object.hasOwn(PROGRESS_EVENT_MESSAGES, event)) {
    return PROGRESS_EVENT_MESSAGES[event];
  }
  return stage ? PROGRESS_STAGE_MESSAGES[stage] ?? null : null;
}
```

Update the call site in `buildRuntimeStatusProjection` to `message: curatedProgressMessage(progress, progressStage),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd kenkui-cloud && deno test --allow-env --config services/control-plane/supabase/deno.json services/control-plane/supabase/functions/_shared/status_projection.test.ts`
Expected: PASS (all prior projection tests still green — the `event`-only behavior is preserved).

- [ ] **Step 5: Commit**

```bash
cd kenkui-cloud
git add services/control-plane/supabase/functions/_shared/status_projection.ts services/control-plane/supabase/functions/_shared/status_projection.test.ts
git commit -m "feat(projection): render 'chapter X of Y' progress message from chapter counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: kengui maps ETA + trusts the projection message

**Files:**
- Modify: `kengui/packages/app/src/api/queue.ts` (`RuntimeStatus.progress` ~line 31)
- Modify: `kengui/packages/app/src/api/cloudQueue.ts` (`normalizeRuntimeStatus` ~lines 177–182; `mapCloudJob` `eta_seconds` ~line 219)
- Test: `kengui/packages/app/src/api/cloudQueue.test.ts`, `kengui/packages/app/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: projection `progress.eta_seconds` and curated `progress.message` (Tasks 1–2).
- Produces: `RuntimeStatus.progress.etaSeconds?: number`; `mapCloudJob` sets `JobResponse.eta_seconds` from it; the runtime status carries the server message verbatim.

- [ ] **Step 1: Write the failing tests**

In `cloudQueue.test.ts` (inside the `fetchCloudQueue runtime status mapping` describe):

```ts
it('maps eta_seconds and the server progress message onto the job', async () => {
  vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [{
    job_id: 'live', status: 'running',
    runtime_status: {
      status: 'running',
      progress: { stage: 'tts_synthesis', percent: 52, message: 'Rendering chapter 14 of 27', eta_seconds: 180 },
    },
  }] });

  const item = (await fetchCloudQueue()).items[0];
  expect(item?.eta_seconds).toBe(180);
  expect(item?.runtimeStatus?.progress?.percent).toBe(52);
  expect(item?.runtimeStatus?.progress?.message).toBe('Rendering chapter 14 of 27');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kengui && npx vitest run --config apps/web/vite.config.ts packages/app/src/api/cloudQueue.test.ts`
Expected: FAIL — `eta_seconds` is 0 and `message` is the generic stage string (or undefined).

- [ ] **Step 3: Implement the mapping**

In `queue.ts`, add `etaSeconds` to the `progress` shape of `RuntimeStatus`:

```ts
  progress?: { stage?: string | undefined; percent?: number | undefined; message?: string | undefined; updatedAt?: string | undefined; ageSeconds?: number | undefined; etaSeconds?: number | undefined } | undefined;
```

In `cloudQueue.ts` `normalizeRuntimeStatus`, replace the `progress` block so the server message is trusted and eta is captured:

```ts
    progress: progress ? compact({
      stage, percent: percentage(progress.percent),
      message: text(progress.message) ?? (stage ? PROGRESS_STAGE_MESSAGES[stage] : undefined),
      updatedAt: timestamp(progress.updated_at),
      ageSeconds: nonnegative(progress.age_seconds),
      etaSeconds: nonnegative(progress.eta_seconds),
    }) : undefined,
```

In `mapCloudJob`, set eta from the runtime status:

```ts
    eta_seconds: runtimeStatus?.progress?.etaSeconds ?? 0,
```

- [ ] **Step 4: Add a Dashboard render assertion**

In `Dashboard.test.tsx`, add a test that a processing cloud job renders the bar, message, and ETA. Use the file's existing render helper/mocks; the essential assertions:

```ts
it('renders percent, chapter message, and ETA for a hosted processing job', async () => {
  // Arrange a queue with one processing job whose runtimeStatus.progress has
  // percent 52, message 'Rendering chapter 14 of 27', etaSeconds 180, mapped to
  // eta_seconds 180 (follow the existing cloud-job render setup in this file).
  // Assert:
  expect(await screen.findByText('Rendering chapter 14 of 27')).toBeInTheDocument();
  expect(screen.getByText(/ETA: 3m 0s/)).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '52');
});
```

(Match the existing Dashboard test's mocking of `fetchQueue`/compute target. `formatEta(180)` → `3m 0s`. `ProgressBar` renders `role="progressbar"` with `aria-valuenow={Math.round(value*100)}`, and Dashboard passes `percent/100`, so percent 52 → `aria-valuenow="52"`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd kengui && npx vitest run --config apps/web/vite.config.ts packages/app/src/api/cloudQueue.test.ts packages/app/src/pages/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd kengui
git add packages/app/src/api/queue.ts packages/app/src/api/cloudQueue.ts packages/app/src/api/cloudQueue.test.ts packages/app/src/pages/Dashboard.test.tsx
git commit -m "feat(cloud): map runtime ETA and trust server progress message

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Modal worker computes and emits ETA

**Files:**
- Create: `kenkui-cloud/packages/kenkui-modal/src/kenkui_modal/progress_eta.py`
- Modify: `kenkui-cloud/packages/kenkui-modal/src/kenkui_modal/worker.py` (`tts_progress` ~lines 278–282)
- Test: `kenkui-cloud/packages/kenkui-modal/tests/test_progress_eta.py`

**Interfaces:**
- Produces: render progress payloads carry `eta_seconds: int` when a stable rate is known (consumed by Task 1's `safeEtaSeconds`).

- [ ] **Step 1: Write the failing test**

Create `tests/test_progress_eta.py`:

```python
from kenkui_modal.progress_eta import RenderEtaEstimator


def test_eta_none_until_two_samples():
    est = RenderEtaEstimator()
    assert est.observe(completed_units=0, total_units=1000, timestamp=100.0) is None


def test_eta_from_steady_rate():
    est = RenderEtaEstimator()
    est.observe(completed_units=100, total_units=1000, timestamp=100.0)
    # 100 units in 10s -> 10 units/s; 800 remaining -> 80s
    assert est.observe(completed_units=300, total_units=1000, timestamp=120.0) == 80


def test_eta_none_when_total_unknown_or_no_progress():
    est = RenderEtaEstimator()
    assert est.observe(completed_units=10, total_units=0, timestamp=1.0) is None
    est2 = RenderEtaEstimator()
    est2.observe(completed_units=50, total_units=1000, timestamp=1.0)
    assert est2.observe(completed_units=50, total_units=1000, timestamp=5.0) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kenkui-cloud/packages/kenkui-modal && pytest tests/test_progress_eta.py -q`
Expected: FAIL — module `kenkui_modal.progress_eta` does not exist.

- [ ] **Step 3: Implement the estimator**

Create `progress_eta.py`:

```python
"""Worker-side ETA estimation from display-neutral render progress facts."""
from __future__ import annotations

from collections import deque
from typing import Any


def _num(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        f = float(value)
        return f if f == f and f not in (float("inf"), float("-inf")) else None
    return None


class RenderEtaEstimator:
    """Estimate remaining seconds from a trailing window of (timestamp, completed)."""

    def __init__(self, window: int = 8) -> None:
        self._samples: deque[tuple[float, float]] = deque(maxlen=window)

    def observe(
        self,
        completed_units: Any,
        total_units: Any,
        timestamp: Any,
    ) -> int | None:
        completed = _num(completed_units)
        total = _num(total_units)
        ts = _num(timestamp)
        if completed is None or total is None or ts is None or total <= 0:
            return None
        self._samples.append((ts, completed))
        if len(self._samples) < 2:
            return None
        (t0, c0), (t1, c1) = self._samples[0], self._samples[-1]
        dt, dc = t1 - t0, c1 - c0
        if dt <= 0 or dc <= 0:
            return None
        rate = dc / dt
        remaining = max(0.0, total - c1)
        return int(round(remaining / rate))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd kenkui-cloud/packages/kenkui-modal && pytest tests/test_progress_eta.py -q`
Expected: PASS.

- [ ] **Step 5: Wire the estimator into the render callback**

In `worker.py`, at the top of the render stage (the function containing `tts_progress`, ~line 272), instantiate the estimator and enrich the payload:

```python
    from .progress_eta import RenderEtaEstimator

    eta_estimator = RenderEtaEstimator()

    def tts_progress(event: Any) -> None:
        payload = _json_safe(event)
        eta = eta_estimator.observe(
            payload.get("completed_units"),
            payload.get("total_units"),
            payload.get("timestamp"),
        )
        if eta is not None:
            payload["eta_seconds"] = eta
        context.progress("render_progress", payload)
```

- [ ] **Step 6: Run the worker test suite to verify no regressions**

Run: `cd kenkui-cloud/packages/kenkui-modal && pytest tests/test_progress_eta.py tests/test_contracts.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd kenkui-cloud
git add packages/kenkui-modal/src/kenkui_modal/progress_eta.py packages/kenkui-modal/src/kenkui_modal/worker.py packages/kenkui-modal/tests/test_progress_eta.py
git commit -m "feat(worker): compute render ETA from progress timestamps and emit eta_seconds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: kenkui emits total_chapters + rendered chapter ordinal

**Files:**
- Modify: `kenkui/src/kenkui/progress.py` (`ProgressEvent` ~lines 32–46)
- Modify: `kenkui/src/kenkui/progress_tracking.py` (`ChapterProgressTracker.__init__` ~line 29; `active_chapter`/`_emit_tts` ~lines 53–62; `process_message` START branch ~line 72)
- Modify: `kenkui/src/kenkui/parsing.py` (`_emit_progress` signature ~line 492; `ChapterProgressTracker(...)` ~line 709)
- Test: `kenkui/tests/test_progress_tracking.py`

**Interfaces:**
- Produces: `ProgressEvent.total_chapters: int` and `ProgressEvent.chapter_ordinal: int`; render events carry the chapter count and the 1-based ordinal of the furthest chapter started. These serialize into the worker payload and feed Task 2's message.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_progress_tracking.py`:

```python
from kenkui.progress import ProgressEvent
from kenkui.progress_tracking import ChapterProgressTracker


def test_tracker_reports_total_and_ordinal_across_started_chapters():
    events: list[ProgressEvent] = []
    tracker = ChapterProgressTracker(
        lambda stage, status, message, **kw: events.append(
            ProgressEvent(stage=stage, status=status, message=message, **kw)
        ),
        total_chars=1000,
        total_chapters=27,
    )
    # START chapter index 13 (msg: event, pid, title, total, total_chars, is_first, index)
    tracker.process_message(("START", 1, "The Mule", 100, 500, False, 13))
    tracker.process_message(("START", 2, "Search by the Foundation", 100, 500, False, 14))

    assert events[-1].total_chapters == 27
    assert events[-1].chapter_ordinal == 2  # two distinct chapters have started
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd kenkui && pytest tests/test_progress_tracking.py::test_tracker_reports_total_and_ordinal_across_started_chapters -q`
Expected: FAIL — `ChapterProgressTracker.__init__` has no `total_chapters`, and `ProgressEvent` has no `total_chapters`/`chapter_ordinal`.

- [ ] **Step 3: Add the ProgressEvent fields**

In `progress.py`, append to `ProgressEvent` (after `active_chapters`):

```python
    total_chapters: int = 0
    chapter_ordinal: int = 0
```

- [ ] **Step 4: Track and emit the counts**

In `progress_tracking.py`, extend `__init__`:

```python
    def __init__(self, emit: EmitFn, total_chars: float, total_chapters: int = 0) -> None:
        self._emit = emit
        self._total_chars = total_chars
        self._total_chapters = total_chapters
        self._started_indices: set[int] = set()
        # ... existing fields unchanged ...
```

In `_emit_tts`, pass the counts:

```python
    def _emit_tts(self, status: str, message: str) -> None:
        self._emit(
            "tts_synthesis",
            status,
            message,
            completed_units=self.completed_tts_units,
            total_units=self._total_chars,
            unit="chars",
            active_chapters=self.active_chapter_progress(),
            total_chapters=self._total_chapters,
            chapter_ordinal=len(self._started_indices),
        )
```

In `process_message`, in the `START` branch, record the index before emitting:

```python
        if event == "START":
            index = msg[6] if len(msg) > 6 else 0
            self._started_indices.add(int(index))
            self.worker_state[pid] = { ... unchanged ... }
```

- [ ] **Step 5: Forward the kwargs from parsing._emit_progress**

In `parsing.py`, extend `_emit_progress` to accept and forward the new kwargs:

```python
    def _emit_progress(
        self,
        stage: ProgressStage,
        status: ProgressStatus,
        message: str = "",
        *,
        completed_units: float = 0.0,
        total_units: float = 0.0,
        unit: ProgressUnit = "",
        active_chapters: tuple[ChapterProgress, ...] = (),
        total_chapters: int = 0,
        chapter_ordinal: int = 0,
    ) -> None:
        if self.progress_callback:
            self.progress_callback(
                ProgressEvent(
                    stage=stage, status=status, message=message,
                    completed_units=completed_units, total_units=total_units, unit=unit,
                    book_hash=self._book_hash,
                    provider=self.cfg.tts_provider or "kokoro",
                    model=self.cfg.tts_model or "",
                    active_chapters=active_chapters,
                    total_chapters=total_chapters,
                    chapter_ordinal=chapter_ordinal,
                )
            )
```

And pass the chapter count when constructing the tracker at `parsing.py:709`:

```python
        tracker = ChapterProgressTracker(self._emit_progress, total_chars, total_chapters=len(chapters))
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd kenkui && pytest tests/test_progress_tracking.py tests/test_generation_progress.py -q`
Expected: PASS (existing progress tests still green — new fields default to 0).

- [ ] **Step 7: Commit**

```bash
cd kenkui
git add src/kenkui/progress.py src/kenkui/progress_tracking.py src/kenkui/parsing.py tests/test_progress_tracking.py
git commit -m "feat(progress): emit total_chapters and rendered chapter ordinal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full verification across repos

**Files:** none (verification only).

- [ ] **Step 1: kengui suite**

Run: `cd kengui && npm test`
Expected: all tests pass (includes new cloudQueue + Dashboard assertions).

- [ ] **Step 2: kenkui-cloud suites**

Run:
```bash
cd kenkui-cloud
deno test --allow-env --config services/control-plane/supabase/deno.json services/control-plane/supabase/functions
(cd packages/kenkui-modal && pytest -q)
```
Expected: all pass.

- [ ] **Step 3: kenkui engine suite**

Run: `cd kenkui && pytest tests/test_progress_tracking.py tests/test_generation_progress.py -q`
Expected: all pass.

- [ ] **Step 4: End-to-end sanity (manual)**

Drive a hosted conversion; confirm the queue card shows an advancing percent bar, a "Rendering chapter X of Y" line, and a decreasing ETA. Then run a local conversion and confirm its progress still renders (regression check — kenkui changes are additive with defaults).

- [ ] **Step 5: Deploy note (not a code step)**

The hosted behavior requires redeploying the edge functions (`supabase functions deploy get-job list-jobs` — they import the shared `status_projection.ts`) and the Modal worker (`modal deploy`). kengui picks up its changes on the next web build.

---

## Self-Review

**Spec coverage:**
- Percent derived in projection → Task 1. ✓
- Worker-side ETA → Task 4 (compute/emit) + Task 1 (projection passthrough) + Task 3 (kengui map). ✓
- "Chapter X of Y" → Task 5 (kenkui emit counts) + Task 2 (projection message) + Task 3 (kengui trust message). ✓
- No SQL migration → payload-only keys. ✓
- Ordinal within rendered set, not absolute index → Task 5 uses a started-index set count. ✓
- Local unaffected / regression check → Task 5 defaults + Task 6 Step 4. ✓
- Out of scope (per-chapter UI, logs feed) → not present. ✓

**Type consistency:** payload keys `eta_seconds`, `total_chapters`, `chapter_ordinal` are used identically in Tasks 4/5 (emit), Tasks 1/2 (projection read), and Task 3 (`etaSeconds` client field). `RenderEtaEstimator.observe(completed_units, total_units, timestamp) -> int | None` matches its call site in Task 4 Step 5. `ChapterProgressTracker(emit, total_chars, total_chapters=…)` matches Task 5 Step 5.

**Placeholder scan:** Task 3 Step 4 references the existing Dashboard test setup rather than repeating it verbatim, and flags verifying the exact `ProgressBar` value attribute — an intentional check against the real component, not a placeholder.
