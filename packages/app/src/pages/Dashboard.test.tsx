import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as queueApi from '../api/queue';
import { nativeCommands } from '../platform';
import { useConnectionStore } from '../store/connection';
import { CloudApiError } from '../api/cloudClient';

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
  vi.clearAllMocks();
  useConnectionStore.setState({ computeTarget: 'local' });
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

  it.each(['pending', 'processing'] as const)(
    'keeps cloud %s cancellation optimistic state nonterminal and disables duplicate cancellation',
    async (status) => {
      useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
      vi.mocked(queueApi.cancelJob).mockImplementation(() => new Promise(() => {}));
      const job = { ...mockJob, status, provider_status: status === 'pending' ? 'queued' : 'running' };
      vi.mocked(queueApi.fetchQueue).mockResolvedValue({
        items: [job], current_item: status === 'processing' ? job : null,
        pending_count: status === 'pending' ? 1 : 0, completed_count: 0, failed_count: 0,
      });
      renderDashboard();

      await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByText('cancelled')).not.toBeInTheDocument();
      expect(screen.getAllByText('Cancellation requested')).toHaveLength(2);
      const requested = screen.getByRole('button', { name: /cancellation requested/i });
      expect(requested).toBeDisabled();
      await userEvent.click(requested);
      expect(queueApi.cancelJob).toHaveBeenCalledTimes(1);
    }
  );

  it('remains nonterminal after a cloud cancellation request refetch', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    vi.mocked(queueApi.cancelJob).mockResolvedValue(undefined);
    const running = { ...mockJob, provider_status: 'running' };
    const requested = {
      ...running, status: 'processing' as const, provider_status: 'cancel_requested',
      current_chapter: 'cancel_requested',
    };
    vi.mocked(queueApi.fetchQueue)
      .mockResolvedValueOnce({ items: [running], current_item: running, pending_count: 0, completed_count: 0, failed_count: 0 })
      .mockResolvedValue({ items: [requested], current_item: requested, pending_count: 0, completed_count: 0, failed_count: 0 });
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(queueApi.fetchQueue).toHaveBeenCalledTimes(2));
    expect(screen.getByText('processing')).toBeInTheDocument();
    expect(screen.queryByText('cancelled')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cancellation requested')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /cancellation requested/i })).toBeDisabled();
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

  it('hides local-only actions for cloud jobs but keeps cloud actions', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    vi.mocked(queueApi.downloadJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.cancelJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.removeJob).mockResolvedValue(undefined);
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [
        { ...mockJob, status: 'pending', id: 'cloud-pending' },
        { ...mockJob, status: 'completed', id: 'cloud-done', output_path: 'cloud-done.m4b' },
      ],
      current_item: null,
      pending_count: 1,
      completed_count: 1,
      failed_count: 0,
    });
    renderDashboard();

    await waitFor(() => screen.getByText(/cloud-done\.m4b/));

    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(queueApi.downloadJob).toHaveBeenCalledWith('cloud-done');
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it.each([
    ['cancel', 'processing', '', 'Failed to cancel job.'],
    ['remove', 'completed', 'cloud-job.m4b', 'Failed to remove job.'],
    ['download', 'completed', 'cloud-job.m4b', 'Failed to open output folder.'],
  ] as const)('never renders cloud response text when %s fails', async (action, status, outputPath, fallback) => {
    const secret = `Bearer ${action.toUpperCase()}_SECRET /Users/alice/private.epub`;
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const rejection = new CloudApiError(500, secret);
    vi.mocked(queueApi.cancelJob).mockRejectedValue(rejection);
    vi.mocked(queueApi.removeJob).mockRejectedValue(rejection);
    vi.mocked(queueApi.downloadJob).mockRejectedValue(rejection);
    const item = { ...mockJob, status, output_path: outputPath };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [item],
      current_item: status === 'processing' ? item : null,
      pending_count: 0,
      completed_count: status === 'completed' ? 1 : 0,
      failed_count: 0,
    });
    renderDashboard();

    await userEvent.click(await screen.findByRole('button', { name: new RegExp(action, 'i') }));

    expect(await screen.findByText(fallback)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(secret);
  });

  it('shows healthy multi-hour hosted runtime without a false failure', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-04T01:00:00Z'));
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, started_at: Date.parse('2026-08-03T20:00:00Z') / 1000, runtimeStatus: {
      status: 'running', observedAt: '2026-08-04T01:00:00Z', attempt: { current: 2, max: 3 },
      progress: { stage: 'render', percent: 40, ageSeconds: 18 },
      heartbeat: { ageSeconds: 4, timeoutSeconds: 60 }, watchdog: { state: 'healthy' as const },
    } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: job, pending_count: 0, completed_count: 0, failed_count: 0 });
    renderDashboard();
    expect(await screen.findByText('Attempt 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Last progress 18s ago')).toBeInTheDocument();
    expect(screen.getByText('Worker heartbeat 4s ago')).toBeInTheDocument();
    expect(screen.getByText('Last progress 18s ago').closest('[aria-live]')).toHaveAttribute('aria-live', 'off');
    expect(screen.getByText('Worker heartbeat 4s ago').closest('[aria-live]')).toHaveAttribute('aria-live', 'off');
    expect(screen.getByText('Time running: 5h 0m')).toBeInTheDocument();
    expect(screen.queryByText(/failure:/i)).not.toBeInTheDocument();
  });

  it.each([
    ['alive-quiet', { progress: { ageSeconds: 90 }, heartbeat: { ageSeconds: 4, timeoutSeconds: 60 }, watchdog: { state: 'healthy' as const } }, 'Worker is alive but has not reported progress recently'],
    ['stale', { progress: { ageSeconds: 90 }, heartbeat: { ageSeconds: 70, timeoutSeconds: 60 }, watchdog: { state: 'stale' as const } }, 'Worker appears stalled; watchdog recovery pending'],
  ])('shows the hosted %s warning', async (_name, details, expected) => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, runtimeStatus: { status: 'running', ...details } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: job, pending_count: 0, completed_count: 0, failed_count: 0 });
    renderDashboard();
    expect(await screen.findByRole('status')).toHaveTextContent(expected);
  });

  it('shows retry countdown and watchdog recovery', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-04T01:00:00Z'));
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, runtimeStatus: {
      status: 'running', attempt: { current: 2, max: 3, nextAttemptAt: '2026-08-04T01:00:42Z' },
      watchdog: { state: 'recovered_retrying' as const },
    } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: job, pending_count: 0, completed_count: 0, failed_count: 0 });
    renderDashboard();
    expect(await screen.findByText('Retry scheduled in 42s')).toBeInTheDocument();
    expect(screen.getByText('Watchdog recovered the job; retrying')).toBeInTheDocument();
    expect(screen.getByText('Retry scheduled in 42s').closest('[aria-live]')).toHaveAttribute('aria-live', 'off');
    expect(screen.getByRole('status')).toHaveTextContent('Watchdog recovered the job; retrying');
  });

  it('does not render a retained retryable cause as a terminal failure while retrying', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, status: 'pending' as const, runtimeStatus: {
      status: 'queued', failure: { code: 'provider_unavailable', message: 'Provider temporarily unavailable', retryable: true },
      watchdog: { state: 'recovered_retrying' as const },
    } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: null, pending_count: 1, completed_count: 0, failed_count: 0 });
    renderDashboard();
    await screen.findByText('Watchdog recovered the job; retrying');
    expect(screen.queryByText(/failure: provider_unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Provider temporarily unavailable')).not.toBeInTheDocument();
  });

  it('treats recovered_failed as terminal rather than recovery pending', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, runtimeStatus: {
      status: 'failed', heartbeat: { ageSeconds: 999, timeoutSeconds: 60 },
      failure: { code: 'heartbeat_timeout', message: 'Worker heartbeat timed out', retryable: false },
      watchdog: { state: 'recovered_failed' as const },
    } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: job, pending_count: 0, completed_count: 0, failed_count: 0 });
    renderDashboard();
    expect(await screen.findByText('Failure: heartbeat_timeout')).toBeInTheDocument();
    expect(screen.getByText('Worker heartbeat timed out')).toBeInTheDocument();
    expect(screen.queryByText(/watchdog recovery pending/i)).not.toBeInTheDocument();
  });

  it('shows a stable permanent failure code and curated detail', async () => {
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = { ...mockJob, status: 'failed' as const, runtimeStatus: {
      status: 'failed', failure: { code: 'voice_incompatible', message: 'Selected voice is incompatible', retryable: false },
      watchdog: { state: 'recovered_failed' as const },
    } };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({ items: [job], current_item: null, pending_count: 0, completed_count: 0, failed_count: 1 });
    renderDashboard();
    expect(await screen.findByText('Failure: voice_incompatible')).toBeInTheDocument();
    expect(screen.getByText('Selected voice is incompatible')).toBeInTheDocument();
  });

  it('never renders raw cloud legacy status or failure fallbacks', async () => {
    const secret = 'Bearer SECRET /Users/alice/private.epub';
    useConnectionStore.setState({ computeTarget: 'kenkui-cloud' });
    const job = {
      ...mockJob, status: 'failed' as const, current_chapter: secret,
      provider_status: secret, error_message: secret,
      runtimeStatus: { status: secret, progress: { stage: secret, message: secret }, failure: { code: secret, message: secret } },
    };
    vi.mocked(queueApi.fetchQueue).mockResolvedValue({
      items: [job], current_item: null, pending_count: 0, completed_count: 0, failed_count: 1,
    });
    renderDashboard();
    await screen.findByText('Test Book');
    expect(document.body).not.toHaveTextContent(secret);
    expect(screen.getByText('Runtime failed')).toBeInTheDocument();
    expect(screen.getByText('Cloud status unavailable')).toBeInTheDocument();
  });
});
