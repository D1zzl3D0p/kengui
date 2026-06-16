import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CirclePause, CirclePlay, ListMusic, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/ui/button';
import { fetchQueue, pauseJob, resumeJob, cancelJob, startQueue } from '../api/queue';
import type { JobResponse, QueueResponse } from '../api/queue';

function formatEta(seconds: number): string {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function JobRow({ job }: { job: JobResponse }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['queue'] });

  const pause = useMutation({ mutationFn: () => pauseJob(job.id), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => resumeJob(job.id), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => cancelJob(job.id), onSuccess: invalidate });
  const start = useMutation({
    mutationFn: startQueue,
    onMutate: async () => {
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
            current_chapter: 'Starting conversion...',
            provider_status: 'starting',
            started_at: item.started_at || Date.now() / 1000,
          };
          return optimisticJob;
        });
        return {
          ...current,
          items,
          current_item: current.current_item ?? optimisticJob,
          pending_count: Math.max(0, current.pending_count - (optimisticJob ? 1 : 0)),
        };
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
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">{job.current_chapter}</span>
            <span>ETA: {formatEta(job.eta_seconds)}</span>
          </div>
        </>
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

      {start.isError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(start.error, 'Failed to start queue.')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {start.isPending ? (
          <Button
            size="sm"
            variant="outline"
            disabled
          >
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
          <Button size="sm" variant="outline" onClick={() => pause.mutate()}>
            <CirclePause aria-hidden="true" />
            Pause
          </Button>
        )}
        {job.status === 'paused' && (
          <Button size="sm" variant="outline" onClick={() => resume.mutate()}>
            <CirclePlay aria-hidden="true" />
            Resume
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="destructive" onClick={() => cancel.mutate()}>
            <X aria-hidden="true" />
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
  const processingCount = data?.items.filter((job) => job.status === 'processing').length ?? 0;

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Library</p>
          <h1 className="text-3xl font-semibold">Conversion Queue</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Track books as they move from page to voice.
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
            <span className="block text-xs text-muted-foreground">Processing</span>
            <span className="font-medium">{processingCount}</span>
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
          <div className="flex size-14 items-center justify-center rounded-lg bg-muted text-primary">
            <ListMusic className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Your shelf is waiting.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No jobs in queue. Add an ebook to begin turning pages into voice.
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
