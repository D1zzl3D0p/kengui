import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Step3Voice from './Step3Voice';
import type { VoiceListResponse } from '../../api/voices';

vi.mock('../../api/voices', () => ({
  fetchVoices: vi.fn(),
  suggestCast: vi.fn(),
}));

vi.mock('../../api/books', () => ({
  analyzeBook: vi.fn(),
}));

vi.mock('../../api/tasks', () => ({
  fetchTask: vi.fn(),
}));

vi.mock('../../api/status', () => ({
  fetchMultivoiceStatus: vi.fn(),
}));

import { fetchVoices, suggestCast } from '../../api/voices';
import { analyzeBook } from '../../api/books';
import { fetchTask } from '../../api/tasks';
import { fetchMultivoiceStatus } from '../../api/status';
const mockFetchVoices = fetchVoices as ReturnType<typeof vi.fn>;
const mockSuggestCast = suggestCast as ReturnType<typeof vi.fn>;
const mockAnalyzeBook = analyzeBook as ReturnType<typeof vi.fn>;
const mockFetchTask = fetchTask as ReturnType<typeof vi.fn>;
const mockFetchMultivoiceStatus = fetchMultivoiceStatus as ReturnType<typeof vi.fn>;

const mockVoiceList: VoiceListResponse = {
  total: 3,
  voices: [
    {
      name: 'alba',
      source: 'coqui',
      gender: 'female',
      accent: 'en-us',
      dataset: null,
      speaker_id: null,
      description: 'Clear female voice',
      display_label: 'Alba (female, en-us)',
      excluded: false,
    },
    {
      name: 'dave',
      source: 'coqui',
      gender: 'male',
      accent: 'en-gb',
      dataset: null,
      speaker_id: null,
      description: 'British male voice',
      display_label: 'Dave (male, en-gb)',
      excluded: false,
    },
    {
      name: 'excluded_voice',
      source: 'coqui',
      gender: 'female',
      accent: 'en-us',
      dataset: null,
      speaker_id: null,
      description: 'Excluded voice',
      display_label: 'Excluded (female, en-us)',
      excluded: true,
    },
  ],
};

describe('Step3Voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMultivoiceStatus.mockResolvedValue({
      spacy_ok: true,
      spacy_model: 'en_core_web_sm',
      ollama_ok: true,
      ollama_url: 'http://localhost:11434',
      message: 'Multi-voice ready',
    });
    mockAnalyzeBook.mockResolvedValue({
      task_id: 'analysis-1',
      type: 'full_analysis',
      status: 'running',
      progress: 10,
      message: 'Queued',
      result: null,
      error: null,
    });
    mockFetchTask.mockResolvedValue({
      task_id: 'analysis-1',
      type: 'full_analysis',
      status: 'completed',
      progress: 100,
      message: 'Done',
      result: {
        characters: [
          {
            character_id: 'alice',
            display_name: 'Alice',
            quote_count: 4,
            mention_count: 12,
            gender_pronoun: 'she',
          },
        ],
        book_hash: 'hash123',
        annotated_chapters_path: '/cache/annotated.json',
        roster_cache_path: '/cache/roster.json',
        nlp_provider: 'ollama',
        nlp_model: 'llama3.2',
        attribution_provider: 'ollama',
        attribution_model: 'llama3.2',
        cache_status: 'miss',
      },
      error: null,
    });
    mockSuggestCast.mockResolvedValue({
      speaker_voices: { alice: 'dave' },
      warnings: [],
    });
  });

  it('loads and displays voices in single mode by default', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
      expect(screen.getByText('Dave (male, en-gb)')).toBeInTheDocument();
    });

    // Excluded voice should not appear
    expect(screen.queryByText('Excluded (female, en-us)')).not.toBeInTheDocument();
  });

  it('switching to multi-voice hides voice list and shows NLP mode selector', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    const multiButton = screen.getByRole('button', { name: /multi.voice/i });
    await userEvent.click(multiButton);

    expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    expect(screen.getByText(/NLP provider/i)).toBeInTheDocument();
  });

  it('Next button calls onNext with selected voice in single mode', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    // Select dave
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'dave');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith({ narrationMode: 'single', voice: 'dave' });
  });

  it('analyzes and calls onNext with multi mode cast data', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    const multiButton = screen.getByRole('button', { name: /multi.voice/i });
    await userEvent.click(multiButton);
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        narrationMode: 'multi',
        voice: 'alba',
        nlpProvider: 'ollama',
        nlpModel: 'llama3.2',
        speakerVoices: { NARRATOR: 'alba', alice: 'dave' },
        annotatedChaptersPath: '/cache/annotated.json',
        rosterCachePath: '/cache/roster.json',
      })
    );
  });
});
