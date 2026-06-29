import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as queueApi from '../api/queue';
import { nativeCommands } from '../platform';

vi.mock('../api/queue');
vi.mock('../platform', () => ({
  nativeCommands: {
    openOutputFolder: vi.fn(() => Promise.resolve()),
  },
}));
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
  job: {
    name: 'Test Book',
    chapter_selection: { preset: 'content-only', included: [1, 2, 3], excluded: [0] },
  },
  status: 'processing' as const,
  progress: 0.4,
  current_chapter: 'Chapter 3',
  eta_seconds: 120,
  error_message: '',
  output_path: '',
  started_at: 1000,
  completed_at: 0,
};

beforeEach(() => {
  vi.mocked(nativeCommands.openOutputFolder).mockResolvedValue(undefined);
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

  it('renders background processing copy without claiming per-chapter visibility', async () => {
    renderDashboard();
    expect(
      await screen.findByText(/local runs use the configured worker count/i)
    ).toBeInTheDocument();
    expect(await screen.findByText(/active jobs/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/one status label is shown per running book/i)
    ).toBeInTheDocument();
    expect(await screen.findByText(/3 selected · 1 excluded/i)).toBeInTheDocument();
  });

  it('describes multiple active jobs without implying active chapter count', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [
        mockJob,
        {
          ...mockJob,
          id: 'job-2',
          job: { name: 'Second Book' },
          current_chapter: 'Chapter 9',
        },
      ],
      current_item: mockJob,
      pending_count: 0,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();

    expect(
      await screen.findByText(/2 books are processing right now/i)
    ).toBeInTheDocument();
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

  it('calls pauseJob on pause click', async () => {
    vi.mocked(queueApi.pauseJob).mockResolvedValue(undefined);
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    await userEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(queueApi.pauseJob).toHaveBeenCalledWith('job-1');
  });

  it('shows ETA and time running for active jobs', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1120000);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/eta: 2m 0s/i)).toBeInTheDocument();
      expect(screen.getByText(/time running: 2m 0s/i)).toBeInTheDocument();
    });

    nowSpy.mockRestore();
  });

  it('removes completed jobs from the queue', async () => {
    vi.mocked(queueApi.removeJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'completed', output_path: '/books/Test Book.m4b', completed_at: 1120 }],
      current_item: null,
      pending_count: 0,
      completed_count: 1,
      failed_count: 0,
    });
    renderDashboard();

    await waitFor(() => screen.getByText(/test book.m4b/i));
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(queueApi.removeJob).toHaveBeenCalledWith('job-1');
  });

  it('removes failed jobs from the queue', async () => {
    vi.mocked(queueApi.removeJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'failed', error_message: 'render failed' }],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 1,
    });
    renderDashboard();

    await waitFor(() => screen.getByText('render failed'));
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(queueApi.removeJob).toHaveBeenCalledWith('job-1');
  });

  it('retries failed jobs', async () => {
    vi.mocked(queueApi.retryJob).mockImplementation(
      () => new Promise(() => {})
    );
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'failed', error_message: 'render failed' }],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 1,
    });
    renderDashboard();

    await waitFor(() => screen.getByText('render failed'));
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(queueApi.retryJob).toHaveBeenCalledWith('job-1');
    expect(screen.getByText('processing')).toBeInTheDocument();
    expect(screen.queryByText('render failed')).not.toBeInTheDocument();
  });

  it('shows output path for completed jobs', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'completed', output_path: '/books/Test Book.m4b' }],
      current_item: null,
      pending_count: 0,
      completed_count: 1,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/\/books\/Test Book\.m4b/i)).toBeInTheDocument()
    );
  });

  it('opens the output folder for completed jobs', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'completed', output_path: '/books/Test Book.m4b' }],
      current_item: null,
      pending_count: 0,
      completed_count: 1,
      failed_count: 0,
    });
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /open/i }));

    expect(nativeCommands.openOutputFolder).toHaveBeenCalledWith('/books/Test Book.m4b');
  });

  it('shows error message for failed jobs', async () => {
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'failed', error_message: 'render failed' }],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 1,
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByText('render failed')).toBeInTheDocument());
  });

  it('starts the queue for pending jobs', async () => {
    vi.mocked(queueApi.startQueue).mockResolvedValue({ status: 'started' });
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'pending' }],
      current_item: null,
      pending_count: 1,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    await userEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(queueApi.startQueue).toHaveBeenCalled();
  });

  it('shows immediate feedback while starting the queue', async () => {
    vi.mocked(queueApi.startQueue).mockImplementation(
      () => new Promise(() => {})
    );
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'pending' }],
      current_item: null,
      pending_count: 1,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled();
    expect(screen.getByText('processing')).toBeInTheDocument();
    expect(
      screen.getByText(/current status: starting background processing/i)
    ).toBeInTheDocument();
  });

  it('shows Remove button for cancelled jobs', async () => {
    vi.mocked(queueApi.removeJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'cancelled' }],
      current_item: null,
      pending_count: 0,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('shows start errors inline', async () => {
    vi.mocked(queueApi.startQueue).mockRejectedValue(new Error('already running'));
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [{ ...mockJob, status: 'pending' }],
      current_item: null,
      pending_count: 1,
      completed_count: 0,
      failed_count: 0,
    });
    renderDashboard();
    await waitFor(() => screen.getByText('Test Book'));
    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    await waitFor(() => expect(screen.getByText('already running')).toBeInTheDocument());
  });
});
