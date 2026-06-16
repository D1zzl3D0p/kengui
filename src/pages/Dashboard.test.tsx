import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import * as queueApi from '../api/queue';

vi.mock('../api/queue');
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
  job: { name: 'Test Book' },
  status: 'processing' as const,
  progress: 0.4,
  current_chapter: 'Chapter 3',
  eta_seconds: 120,
  error_message: '',
  output_path: '',
  started_at: 0,
  completed_at: 0,
};

beforeEach(() => {
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

  it('renders status badge', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('processing')).toBeInTheDocument());
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
});
