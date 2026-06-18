import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { BookOpen, CirclePause, CirclePlay, ListMusic, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/ui/button';
import {
  fetchQueue,
  pauseJob,
  resumeJob,
  cancelJob,
  removeJob,
  startQueue,
} from '../api/queue';
import type { JobResponse, QueueResponse } from '../api/queue';

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function JobRow({ job }: { job: JobResponse }) {
  const qc = useQueryClient();
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

  const name = (job.job as { name?: string }).name ?? job.id;
  const progressValue = job.progress > 1 ? job.progress / 100 : job.progress;
  const canCancel =
    job.status === 'pending' || job.status === 'processing' || job.status === 'paused';
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
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {(job.status === 'processing' || job.status === 'paused') && (
        <>
          <ProgressBar value={progressValue} />
          <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">Background chapter: {job.current_chapter}</span>
            <span>ETA: {formatEta(job.eta_seconds)}</span>
          </div>
        </>
      )}

      {showTiming && runningSeconds !== null && (
        <p className="text-xs text-muted-foreground">
          Time running: {formatDuration(runningSeconds)}
        </p>
      )}

      {job.status === 'completed' && job.output_path && (
        <p className="text-xs text-muted-foreground break-all">
          Output: {job.output_path}
        </p>
      )}

      {job.status === 'failed' && job.error_message && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {job.error_message}
        </p>
      )}

      {job.provider_status && (
        <p className="text-xs text-muted-foreground">{job.provider_status}</p>
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
        ) : job.status === 'pending' && (
          <Button size="sm" variant="outline" onClick={() => start.mutate()}>
            <CirclePlay aria-hidden="true" />
            Start
          </Button>
        )}
        {job.status === 'processing' && (
          <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
            <CirclePause aria-hidden="true" />
            {pause.isPending ? 'Pausing...' : 'Pause'}
          </Button>
        )}
        {job.status === 'paused' && (
          <Button size="sm" variant="outline" onClick={() => resume.mutate()} disabled={resume.isPending}>
            <CirclePlay aria-hidden="true" />
            {resume.isPending ? 'Resuming...' : 'Resume'}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X aria-hidden="true" />
            {cancel.isPending ? 'Cancelling...' : 'Cancel'}
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['queue'],
    queryFn: fetchQueue,
    refetchInterval: 2000,
  });
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
            Local runs request all CPU threads, so several chapters can process in parallel.
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
            <span className="block text-xs text-muted-foreground">Active chapters</span>
            <span className="font-medium">{processingCount}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {processingCount > 1
                ? `${processingCount} chapters are processing in parallel right now`
                : 'Chapter work runs in the background'}
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
