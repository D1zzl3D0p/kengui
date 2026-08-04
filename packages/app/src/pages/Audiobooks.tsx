import { useQuery } from '@tanstack/react-query';
import { Headphones, MapPin } from 'lucide-react';
import { Layout } from '../components/Layout';
import { fetchQueue } from '../api/queue';
import type { JobResponse } from '../api/queue';

function jobName(job: JobResponse): string {
  const name = job.job.name;
  return typeof name === 'string' && name.trim() ? name : job.id;
}

function outputLocation(job: JobResponse): string {
  return job.output_path || job.artifact_uri || '';
}

function completedAudiobooks(items: JobResponse[]): JobResponse[] {
  return items
    .filter((job) => job.status === 'completed' && outputLocation(job))
    .sort((a, b) => b.completed_at - a.completed_at);
}

function formatCompletedAt(value: number): string | null {
  if (!value) return null;
  return new Date(value * 1000).toLocaleString();
}

export default function Audiobooks() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['queue'],
    queryFn: fetchQueue,
    refetchInterval: 5000,
  });
  const audiobooks = completedAudiobooks(data?.items ?? []);

  return (
    <Layout>
      <div className="flex max-w-5xl flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-primary">Audiobooks</p>
          <h1 className="text-3xl font-semibold">Audiobooks</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A simple log of finished performances and where KenGUI placed them.
          </p>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading audiobook log…</p>}
        {isError && (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Failed to load audiobook log.
          </p>
        )}

        {!isLoading && !isError && audiobooks.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-lg border bg-card px-6 py-16 text-center shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
            <div className="flex size-14 items-center justify-center rounded-lg bg-muted text-primary">
              <Headphones className="size-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">No audiobook destinations yet.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Completed conversions with an output path will appear here.
              </p>
            </div>
          </div>
        )}

        {audiobooks.length > 0 && (
          <div className="flex flex-col gap-3">
            {audiobooks.map((job) => {
              const completedAt = formatCompletedAt(job.completed_at);
              const location = outputLocation(job);
              return (
                <article
                  key={job.id}
                  className="rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="hidden size-11 shrink-0 items-center justify-center rounded-md bg-muted text-primary sm:flex">
                      <Headphones className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold">{jobName(job)}</h2>
                      {completedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Completed {completedAt}
                        </p>
                      )}
                      <p className="mt-3 flex gap-2 break-all rounded-md border bg-background/45 px-3 py-2 text-sm">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{location}</span>
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
