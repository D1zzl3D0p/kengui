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
