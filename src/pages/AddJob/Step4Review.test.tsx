import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Step4Review from './Step4Review';
import { ApiError } from '../../api/client';
import type { WizardState } from './index';
import type { JobResponse } from '../../api/queue';

vi.mock('../../api/queue', () => ({
  createJob: vi.fn(),
  startQueue: vi.fn(),
  fetchQueue: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  cancelJob: vi.fn(),
}));

import { createJob } from '../../api/queue';
import { startQueue } from '../../api/queue';
const mockCreateJob = createJob as ReturnType<typeof vi.fn>;
const mockStartQueue = startQueue as ReturnType<typeof vi.fn>;

const mockState: WizardState = {
  filePath: '/books/great-book.epub',
  book: {
    book_hash: 'hash123',
    metadata: { title: 'Great Book', author: 'Some Author' },
    chapters: [],
    total_chapters: 10,
    total_word_count: 80000,
  },
  chapterPreset: 'content-only',
  narrationMode: 'single',
  voice: 'alba',
};

const mockJobResponse: JobResponse = {
  id: 'job-1',
  job: {},
  status: 'pending',
  progress: 0,
  current_chapter: '',
  eta_seconds: 0,
  error_message: '',
  output_path: '',
  started_at: 0,
  completed_at: 0,
};

describe('Step4Review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartQueue.mockResolvedValue({ status: 'started' });
  });

  it('displays summary of wizard selections', () => {
    render(
      <Step4Review state={mockState} onBack={vi.fn()} onDone={vi.fn()} />
    );

    expect(screen.getByText('Great Book')).toBeInTheDocument();
    expect(screen.getByText(/content-only/i)).toBeInTheDocument();
    expect(screen.getByText(/single/i)).toBeInTheDocument();
    expect(screen.getByText(/alba/i)).toBeInTheDocument();
  });

  it('calls createJob with correct payload and onDone on success', async () => {
    mockCreateJob.mockResolvedValue(mockJobResponse);
    const onDone = vi.fn();

    render(
      <Step4Review state={mockState} onBack={vi.fn()} onDone={onDone} />
    );

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockCreateJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ebook_path: '/books/great-book.epub',
          voice: 'alba',
          narration_mode: 'single',
          tts_execution_mode: 'local',
          chapter_selection: expect.objectContaining({ preset: 'content-only' }),
        })
      );
      expect(mockStartQueue).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalled();
    });
  });

  it('submits a valid narrator voice for multi-voice jobs', async () => {
    mockCreateJob.mockResolvedValue(mockJobResponse);

    render(
      <Step4Review
        state={{ ...mockState, narrationMode: 'multi', voice: 'alba' }}
        onBack={vi.fn()}
        onDone={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockCreateJob).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: 'alba',
          narration_mode: 'multi',
        })
      );
    });
  });

  it('still completes when the job is submitted but queue start fails', async () => {
    mockCreateJob.mockResolvedValue(mockJobResponse);
    mockStartQueue.mockRejectedValue(new ApiError(400, 'Processing already in progress'));
    const onDone = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <Step4Review state={mockState} onBack={vi.fn()} onDone={onDone} />
    );

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockCreateJob).toHaveBeenCalled();
      expect(mockStartQueue).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalled();
    });

    expect(screen.queryByText(/failed to submit/i)).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('shows error message when createJob fails', async () => {
    mockCreateJob.mockRejectedValue(new Error('Server error'));

    render(
      <Step4Review state={mockState} onBack={vi.fn()} onDone={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to submit job: server error/i)).toBeInTheDocument();
    });
  });

  it('shows backend detail when createJob returns an API error', async () => {
    mockCreateJob.mockRejectedValue(new ApiError(422, '{"detail":"Invalid voice"}'));

    render(
      <Step4Review state={mockState} onBack={vi.fn()} onDone={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to submit job: invalid voice/i)).toBeInTheDocument();
    });
  });
});
