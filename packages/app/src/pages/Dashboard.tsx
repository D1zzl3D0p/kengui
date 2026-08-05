import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { BookOpen, ChevronRight, CirclePause, CirclePlay, FolderOpen, ListMusic, RotateCcw, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { RunHealthBadge } from '../components/RunHealthBadge';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/ui/button';
import {
  fetchQueue,
  pauseJob,
  resumeJob,
  retryJob,
  cancelJob,
  removeJob,
  startQueue,
  downloadJob,
} from '../api/queue';
import type { JobResponse, QueueResponse } from '../api/queue';
import { cloudJobStatusMessage, normalizeCloudJobProviderStatus, normalizeRuntimeStatus } from '../api/cloudQueue';
import { nativeCommands } from '../platform';
import { computeBackoffInterval, heartbeatHealthBucket, runtimeStatusFingerprint } from '../lib/pollingBackoff';
import { useConnectionStore } from '../store/connection';
import { CloudApiError } from '../api/cloudClient';

function formatEta(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

function summarizeQueue(items: JobResponse[]) {
  const currentItem = items.find((item) => item.status === 'processing' || item.status === 'paused') ?? null;

  return {
    items,
    current_item: currentItem,
    pending_count: items.filter((job) => job.status === 'pending').length,
    completed_count: items.filter((job) => job.status === 'completed').length,
    failed_count: items.filter((job) => job.status === 'failed').length,
  };
}

function selectedChapterSummary(job: JobResponse): string | null {
  const selection = (job.job as {
    chapter_selection?: {
      included?: unknown;
      excluded?: unknown;
      preset?: unknown;
    };
  }).chapter_selection;
  if (!selection) return null;

  const included = Array.isArray(selection.included) ? selection.included.length : 0;
  const excluded = Array.isArray(selection.excluded) ? selection.excluded.length : 0;
  const preset = typeof selection.preset === 'string' ? selection.preset : 'custom';

  if (included === 0 && excluded === 0) {
    return `${preset} chapter preset`;
  }

  return `${included} selected · ${excluded} excluded`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof CloudApiError) return fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

function advancedAge(age: number | undefined, observedAt: string | undefined): number | null {
  if (age === undefined || !Number.isFinite(age)) return null;
  const observed = observedAt ? Date.parse(observedAt) : NaN;
  const elapsed = Number.isFinite(observed)
    ? Math.min(31 * 24 * 3600, Math.max(0, (Date.now() - observed) / 1000)) : 0;
  return Math.max(0, Math.round(age + elapsed));
}

function RuntimeDetails({ job }: { job: JobResponse }) {
  const runtime = job.runtimeStatus;
  if (!runtime) return null;
  const progressAge = advancedAge(runtime.progress?.ageSeconds, runtime.observedAt);
  const heartbeatAge = advancedAge(runtime.heartbeat?.ageSeconds, runtime.observedAt);
  const currentRuntime = {
    ...runtime,
    progress: runtime.progress && progressAge !== null ? { ...runtime.progress, ageSeconds: progressAge } : runtime.progress,
    heartbeat: runtime.heartbeat && heartbeatAge !== null ? { ...runtime.heartbeat, ageSeconds: heartbeatAge } : runtime.heartbeat,
  };
  const health = heartbeatHealthBucket(currentRuntime);
  const retryAt = runtime.attempt?.nextAttemptAt ? Date.parse(runtime.attempt.nextAttemptAt) : NaN;
  const retrySeconds = Number.isFinite(retryAt) ? Math.max(0, Math.round((retryAt - Date.now()) / 1000)) : null;
  const warning = runtime.watchdog?.state === 'recovered_retrying'
    ? 'Watchdog recovered the job; retrying'
    : runtime.watchdog?.state === 'stale' || health === 'stale'
      ? 'Worker appears stalled; watchdog recovery pending'
      : health === 'alive-quiet'
        ? 'Worker is alive but has not reported progress recently'
        : null;
  const terminalFailure = job.status === 'failed'
    || runtime.status === 'failed'
    || runtime.watchdog?.state === 'recovered_failed';

  const hasTelemetry =
    (runtime.attempt?.current !== undefined && runtime.attempt.max !== undefined) ||
    progressAge !== null ||
    heartbeatAge !== null ||
    retrySeconds !== null;
  const latestMessage = runtime.progress?.message;

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      {warning && (
        <p role="status" aria-live="polite" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
          {warning}
        </p>
      )}
      {terminalFailure && runtime.failure?.code && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-destructive">
          <span className="font-medium">Failure: {runtime.failure.code}</span>
          {runtime.failure.message && <p className="mt-1 text-sm">{runtime.failure.message}</p>}
        </div>
      )}
      {terminalFailure && !runtime.failure?.code && runtime.watchdog?.state === 'recovered_failed' && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-destructive">
          <span className="font-medium">Failure: watchdog recovery failed</span>
        </div>
      )}
      {hasTelemetry && (
        <details className="group rounded-md border bg-background/40 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-foreground/80 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden="true" />
            Run details
          </summary>
          <div className="mt-2 flex flex-col gap-1" aria-live="off">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {runtime.attempt?.current !== undefined && runtime.attempt.max !== undefined && (
                <span>Attempt {runtime.attempt.current} of {runtime.attempt.max}</span>
              )}
              {progressAge !== null && <span>Last progress {progressAge}s ago</span>}
              {heartbeatAge !== null && <span>Worker heartbeat {heartbeatAge}s ago</span>}
              {retrySeconds !== null && <span>Retry scheduled in {retrySeconds}s</span>}
            </div>
            {latestMessage && <p>Latest: {latestMessage}</p>}
          </div>
        </details>
      )}
    </div>
  );
}

function normalizeCloudRuntimeForUi(value: JobResponse['runtimeStatus']): JobResponse['runtimeStatus'] {
  if (!value) return undefined;
  return normalizeRuntimeStatus({
    status: value.status,
    observed_at: value.observedAt,
    attempt: value.attempt && {
      current: value.attempt.current, max: value.attempt.max,
      next_attempt_at: value.attempt.nextAttemptAt,
    },
    progress: value.progress && {
      stage: value.progress.stage, percent: value.progress.percent,
      message: value.progress.message,
      updated_at: value.progress.updatedAt, age_seconds: value.progress.ageSeconds,
    },
    heartbeat: value.heartbeat && {
      at: value.heartbeat.at, age_seconds: value.heartbeat.ageSeconds,
      timeout_seconds: value.heartbeat.timeoutSeconds,
    },
    failure: value.failure && {
      code: value.failure.code, message: value.failure.message, retryable: value.failure.retryable,
    },
    watchdog: value.watchdog,
  });
}

function JobRow({ job: rawJob }: { job: JobResponse }) {
  const qc = useQueryClient();
  const computeTarget = useConnectionStore((state) => state.computeTarget);
  const cloudQueue = computeTarget === 'kenkui-cloud';
  const cloudRuntime = cloudQueue ? normalizeCloudRuntimeForUi(rawJob.runtimeStatus) : rawJob.runtimeStatus;
  const cloudProviderStatus = normalizeCloudJobProviderStatus(rawJob.provider_status);
  const job: JobResponse = cloudQueue ? {
    ...rawJob,
    provider_status: cloudProviderStatus,
    current_chapter: cloudJobStatusMessage(cloudProviderStatus),
    error_message: rawJob.status === 'failed'
      ? cloudRuntime?.failure?.message ?? 'Cloud job failed.' : '',
    runtimeStatus: cloudRuntime,
  } : rawJob;
  const [actionError, setActionError] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['queue'] });

  function updateOptimistically(updater: (item: JobResponse | null) => JobResponse | null) {
    qc.setQueryData<QueueResponse>(['queue'], (current) => {
      if (!current) return current;
      const items = current.items
        .map((item) => (item.id === job.id ? updater(item) : item))
        .filter((item): item is JobResponse => item !== null);
      return summarizeQueue(items);
    });
  }

  const pause = useMutation({
    mutationFn: () => pauseJob(job.id),
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      updateOptimistically((item) => {
        if (!item || item.status !== 'processing') return item;
        return { ...item, status: 'paused' };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
      setActionError(errorMessage(error, 'Failed to pause job.'));
    },
    onSettled: invalidate,
  });

  const resume = useMutation({
    mutationFn: () => resumeJob(job.id),
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      updateOptimistically((item) => {
        if (!item || item.status !== 'paused') return item;
        return { ...item, status: 'processing' };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
      setActionError(errorMessage(error, 'Failed to resume job.'));
    },
    onSettled: invalidate,
  });

  const cancel = useMutation({
    mutationFn: () => cancelJob(job.id),
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      updateOptimistically((item) => {
        if (!item || !['pending', 'processing', 'paused'].includes(item.status)) return item;
        if (computeTarget === 'kenkui-cloud') {
          return {
            ...item,
            provider_status: 'cancel_requested',
            current_chapter: 'Cancellation requested',
          };
        }
        return { ...item, status: 'cancelled' };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
      setActionError(errorMessage(error, 'Failed to cancel job.'));
    },
    onSettled: invalidate,
  });

  const retry = useMutation({
    mutationFn: () => retryJob(job.id),
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      updateOptimistically((item) => {
        if (!item || item.status !== 'failed') return item;
        return {
          ...item,
          status: 'processing',
          progress: 0,
          current_chapter: 'Retrying failed job...',
          eta_seconds: 0,
          error_message: '',
          output_path: '',
          completed_at: 0,
          provider_status: 'retrying',
          started_at: item.started_at || Date.now() / 1000,
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
      setActionError(errorMessage(error, 'Failed to retry job.'));
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => removeJob(job.id),
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      qc.setQueryData<QueueResponse>(['queue'], (current) => {
        if (!current) return current;
        const items = current.items.filter((item) => item.id !== job.id);
        return summarizeQueue(items);
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
      setActionError(errorMessage(error, 'Failed to remove job.'));
    },
    onSettled: invalidate,
  });

  const start = useMutation({
    mutationFn: startQueue,
    onMutate: async () => {
      setActionError(null);
      await qc.cancelQueries({ queryKey: ['queue'] });
      const previous = qc.getQueryData<QueueResponse>(['queue']);
      qc.setQueryData<QueueResponse>(['queue'], (current) => {
        if (!current) return current;
        let optimisticJob: JobResponse | null = null;
        const items = current.items.map((item) => {
          if (item.id !== job.id) return item;
          optimisticJob = {
            ...item,
            status: 'processing',
            current_chapter: 'Starting background processing...',
            provider_status: 'starting',
            started_at: item.started_at || Date.now() / 1000,
          };
          return optimisticJob;
        });
        return summarizeQueue(items.length > 0 ? items : current.items);
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(['queue'], context.previous);
      }
    },
    onSettled: invalidate,
  });

  const openOutput = useMutation({
    mutationFn: () =>
      computeTarget === 'kenkui-cloud'
        ? downloadJob(job.id)
        : nativeCommands.openOutputFolder(job.output_path),
    onMutate: () => {
      setActionError(null);
    },
    onError: (error) => {
      setActionError(errorMessage(error, 'Failed to open output folder.'));
    },
  });

  const name = (job.job as { name?: string }).name ?? job.id;
  const reportedProgress = job.runtimeStatus?.progress?.percent ?? job.progress;
  const progressValue = reportedProgress > 1 ? reportedProgress / 100 : reportedProgress;
  const chapterSummary = selectedChapterSummary(job);
  const cancellationRequested = cloudQueue && job.provider_status === 'cancel_requested';
  const canCancel = !cancellationRequested &&
    (job.status === 'pending' || job.status === 'processing' || job.status === 'paused');
  const runningSeconds =
    job.started_at > 0
      ? Math.max(
          0,
          (job.completed_at > 0 ? job.completed_at : Date.now() / 1000) - job.started_at
        )
      : null;
  const showTiming = runningSeconds !== null || (job.status === 'processing' || job.status === 'paused');

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-md bg-muted text-primary sm:flex">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block truncate font-medium">{name}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Conversion job
            </span>
            {chapterSummary && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {chapterSummary}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RunHealthBadge runtime={job.runtimeStatus} />
          <StatusBadge status={job.status} />
        </div>
      </div>

      {(job.status === 'processing' || job.status === 'paused') && (
        <>
          <ProgressBar value={progressValue} />
          <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              Current status: {job.runtimeStatus?.progress?.message ?? job.current_chapter}
            </span>
            <span>ETA: {formatEta(job.eta_seconds)}</span>
          </div>
        </>
      )}

      {showTiming && runningSeconds !== null && (
        <p className="text-xs text-muted-foreground">
          Time running: {formatDuration(runningSeconds)}
        </p>
      )}

      <RuntimeDetails job={job} />

      {job.status === 'completed' && job.output_path && (
        <p className="text-xs text-muted-foreground break-all">
          Output: {job.output_path}
        </p>
      )}

      {job.status === 'failed' && job.error_message && !job.runtimeStatus?.failure?.message && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {job.error_message}
        </p>
      )}

      {job.provider_status && (
        <p className="text-xs text-muted-foreground">
          {cancellationRequested ? 'Cancellation requested' : (cloudQueue ? cloudJobStatusMessage(job.provider_status) : job.provider_status)}
        </p>
      )}

      {actionError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {start.isError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(start.error, 'Failed to start queue.')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {start.isPending ? (
          <Button size="sm" variant="outline" disabled>
            <CirclePlay aria-hidden="true" />
            Starting...
          </Button>
        ) : !cloudQueue && job.status === 'pending' && (
          <Button size="sm" variant="outline" onClick={() => start.mutate()}>
            <CirclePlay aria-hidden="true" />
            Start
          </Button>
        )}
        {!cloudQueue && job.status === 'processing' && (
          <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
            <CirclePause aria-hidden="true" />
            {pause.isPending ? 'Pausing...' : 'Pause'}
          </Button>
        )}
        {!cloudQueue && job.status === 'paused' && (
          <Button size="sm" variant="outline" onClick={() => resume.mutate()} disabled={resume.isPending}>
            <CirclePlay aria-hidden="true" />
            {resume.isPending ? 'Resuming...' : 'Resume'}
          </Button>
        )}
        {!cloudQueue && job.status === 'failed' && (
          <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
            <RotateCcw aria-hidden="true" />
            {retry.isPending ? 'Retrying...' : 'Retry'}
          </Button>
        )}
        {job.status === 'completed' && job.output_path && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openOutput.mutate()}
            disabled={openOutput.isPending}
          >
            <FolderOpen aria-hidden="true" />
            {openOutput.isPending ? (cloudQueue ? 'Downloading...' : 'Opening...') : (cloudQueue ? 'Download' : 'Open')}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X aria-hidden="true" />
            {cancel.isPending ? 'Cancelling...' : 'Cancel'}
          </Button>
        )}
        {cancellationRequested && (
          <Button size="sm" variant="destructive" disabled>
            <X aria-hidden="true" />
            Cancellation requested
          </Button>
        )}
        {(job.status === 'failed' || job.status === 'completed' || job.status === 'cancelled') && (
          <Button size="sm" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <X aria-hidden="true" />
            {remove.isPending ? 'Removing...' : 'Remove'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const backoffCountRef = useRef(0);
  const lastQueueHashRef = useRef('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['queue'],
    queryFn: fetchQueue,
    refetchInterval: () => computeBackoffInterval(backoffCountRef.current, { initial: 2000, cap: 15000 }),
  });

  useEffect(() => {
    const hash = JSON.stringify(data?.items.map((item) =>
      `${item.id}:${runtimeStatusFingerprint(item.runtimeStatus ?? {
        status: item.status,
        progress: { stage: item.current_chapter, percent: item.progress },
      })}`
    ));
    if (hash === lastQueueHashRef.current) {
      backoffCountRef.current += 1;
    } else {
      backoffCountRef.current = 0;
      lastQueueHashRef.current = hash;
    }
  }, [data]);

  const processingCount = data?.items.filter((job) => job.status === 'processing').length ?? 0;

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card/70 p-5 shadow-[0_12px_36px_rgb(40_58_66_/_8%)] sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Library</p>
          <h1 className="text-3xl font-semibold">Conversion Queue</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Welcome to the Kenku scriptorium. Track books as they move from page to voice.
          </p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Local runs use the configured worker count. The queue API reports one current status label per book.
          </p>
        </div>
        <Button onClick={() => navigate('/add')}>
          <BookOpen aria-hidden="true" />
          Add Book
        </Button>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-md border bg-card px-3 py-2">
            <span className="block text-xs text-muted-foreground">Pending</span>
            <span className="font-medium">{data.pending_count}</span>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <span className="block text-xs text-muted-foreground">Active jobs</span>
            <span className="font-medium">{processingCount}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {processingCount > 1
                ? `${processingCount} books are processing right now`
                : 'One status label is shown per running book'}
            </span>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <span className="block text-xs text-muted-foreground">Completed</span>
            <span className="font-medium">{data.completed_count}</span>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <span className="block text-xs text-muted-foreground">Failed</span>
            <span className="font-medium">{data.failed_count}</span>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load queue.
        </p>
      )}

      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-lg border bg-card px-6 py-16 text-center shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex size-16 items-center justify-center rounded-2xl border bg-[radial-gradient(circle_at_35%_25%,rgb(184_155_77_/_32%),rgb(47_111_106_/_10%))] text-primary shadow-inner">
            <ListMusic className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Your shelf is waiting.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No jobs in queue. Hand the Kenku an ebook and it will start turning pages into voice.
            </p>
          </div>
          <Button onClick={() => navigate('/add')}>Add Book</Button>
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
