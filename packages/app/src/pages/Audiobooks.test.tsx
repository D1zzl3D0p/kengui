import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Audiobooks from './Audiobooks';
import * as queueApi from '../api/queue';

vi.mock('../api/queue');

function renderAudiobooks() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Audiobooks />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const baseJob = {
  id: 'job-1',
  job: { name: 'The Raven' },
  status: 'completed' as const,
  progress: 1,
  current_chapter: '',
  eta_seconds: 0,
  error_message: '',
  output_path: '/Users/dizzler/Audiobooks/The Raven.m4b',
  started_at: 100,
  completed_at: 200,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Audiobooks', () => {
  it('lists completed audiobook output locations', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [
        baseJob,
        { ...baseJob, id: 'job-2', status: 'processing', job: { name: 'Still Cooking' }, output_path: '' },
      ],
      current_item: null,
      pending_count: 0,
      completed_count: 1,
      failed_count: 0,
    });

    renderAudiobooks();

    expect(await screen.findByRole('heading', { name: /audiobooks/i })).toBeInTheDocument();
    expect(await screen.findByText('The Raven')).toBeInTheDocument();
    expect(screen.getByText('/Users/dizzler/Audiobooks/The Raven.m4b')).toBeInTheDocument();
    expect(screen.queryByText('Still Cooking')).not.toBeInTheDocument();
  });

  it('uses artifact URI when a completed hosted job has no local output path', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [
        {
          ...baseJob,
          id: 'job-hosted',
          job: { name: 'Cloud Birdsong' },
          output_path: '',
          artifact_uri: 's3://kengui-artifacts/cloud-birdsong.m4b',
          artifact_source: 'hosted',
        },
      ],
      current_item: null,
      pending_count: 0,
      completed_count: 1,
      failed_count: 0,
    });

    renderAudiobooks();

    expect(await screen.findByText('Cloud Birdsong')).toBeInTheDocument();
    expect(screen.getByText('s3://kengui-artifacts/cloud-birdsong.m4b')).toBeInTheDocument();
  });

  it('shows an empty state when no completed jobs have output locations', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...baseJob, status: 'failed', output_path: '' }],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 1,
    });

    renderAudiobooks();

    expect(await screen.findByText(/no audiobook destinations yet/i)).toBeInTheDocument();
  });
});
