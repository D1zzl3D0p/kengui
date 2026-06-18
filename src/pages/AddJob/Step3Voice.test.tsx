import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Step3Voice from './Step3Voice';
import type { VoiceListResponse } from '../../api/voices';

vi.mock('../../api/voices', () => ({
  fetchVoices: vi.fn(),
  suggestCast: vi.fn(),
}));

vi.mock('../../hooks/useProviderModels', () => ({
  useProviderModels: vi.fn(),
}));

vi.mock('../../api/books', () => ({
  analyzeBook: vi.fn(),
  fetchAnalysisCaches: vi.fn(),
}));

vi.mock('../../api/config', () => ({
  fetchConfig: vi.fn(),
}));

vi.mock('../../api/tasks', () => ({
  fetchTask: vi.fn(),
}));

vi.mock('../../api/status', () => ({
  fetchMultivoiceStatus: vi.fn(),
}));

vi.mock('../../api/series', () => ({
  createEmptySeries: vi.fn(),
  fetchSeries: vi.fn(),
}));

import { fetchVoices, suggestCast } from '../../api/voices';
import { analyzeBook, fetchAnalysisCaches } from '../../api/books';
import { fetchConfig } from '../../api/config';
import { fetchTask } from '../../api/tasks';
import { fetchMultivoiceStatus } from '../../api/status';
import { createEmptySeries, fetchSeries } from '../../api/series';
import { useProviderModels } from '../../hooks/useProviderModels';
const mockFetchVoices = fetchVoices as ReturnType<typeof vi.fn>;
const mockSuggestCast = suggestCast as ReturnType<typeof vi.fn>;
const mockAnalyzeBook = analyzeBook as ReturnType<typeof vi.fn>;
const mockFetchAnalysisCaches = fetchAnalysisCaches as ReturnType<typeof vi.fn>;
const mockFetchConfig = fetchConfig as ReturnType<typeof vi.fn>;
const mockFetchTask = fetchTask as ReturnType<typeof vi.fn>;
const mockFetchMultivoiceStatus = fetchMultivoiceStatus as ReturnType<typeof vi.fn>;
const mockFetchSeries = fetchSeries as ReturnType<typeof vi.fn>;
const mockCreateEmptySeries = createEmptySeries as ReturnType<typeof vi.fn>;
const mockUseProviderModels = useProviderModels as ReturnType<typeof vi.fn>;

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
    mockUseProviderModels.mockReturnValue({
      models: ['llama3.2', 'qwen2.5'],
      loading: false,
      error: null,
    });
    mockFetchMultivoiceStatus.mockResolvedValue({
      spacy_ok: true,
      spacy_model: 'en_core_web_sm',
      ollama_ok: true,
      ollama_url: 'http://localhost:11434',
      message: 'Multi-voice ready',
    });
    mockFetchConfig.mockResolvedValue({
      config: {
        nlp_provider: 'ollama',
        nlp_model: 'llama3.2',
        nlp_discovery_method: 'auto',
      },
    });
    mockFetchAnalysisCaches.mockResolvedValue({ book_hash: 'hash123', candidates: [] });
    mockFetchSeries.mockResolvedValue({ series: [], total: 0 });
    mockCreateEmptySeries.mockResolvedValue({ slug: 'the-expanse', name: 'The Expanse' });
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
    const select = screen.getByLabelText(/narrator voice/i);
    await userEvent.selectOptions(select, 'dave');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ narrationMode: 'single', voice: 'dave' }));
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
    await userEvent.click(screen.getByLabelText(/nlp model/i));
    await userEvent.click(screen.getByRole('option', { name: 'qwen2.5' }));
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    expect(mockAnalyzeBook).toHaveBeenCalledWith(
      expect.objectContaining({ use_cache: false })
    );

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText(/analysis source: fresh run/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        narrationMode: 'multi',
        voice: 'alba',
        nlpProvider: 'ollama',
        nlpModel: 'qwen2.5',
        speakerVoices: { NARRATOR: 'alba', alice: 'dave' },
        annotatedChaptersPath: '/cache/annotated.json',
        rosterCachePath: '/cache/roster.json',
      })
    );
  });

  it('auto-selects the most recent cache and uses it when requested', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchAnalysisCaches.mockResolvedValueOnce({
      book_hash: 'hash123',
      candidates: [
        {
          cache_id: 'older-cache.json',
          step: 'attribution',
          provider: 'ollama',
          model: 'llama3.2',
          method: '',
          created_at: '2026-06-18T09:00:00Z',
          description: 'Older attribution cache',
          path: '/cache/older-cache.json',
          character_count: 22,
          chapter_count: 30,
          quote_count: 2,
        },
        {
          cache_id: 'newer-cache.json',
          step: 'attribution',
          provider: 'openrouter',
          model: 'openai/gpt-4.1-mini',
          method: 'llm',
          created_at: '2026-06-18T10:00:00Z',
          description: 'Newest attribution cache',
          path: '/cache/newer-cache.json',
          character_count: 44,
          chapter_count: 63,
          quote_count: 4,
        },
      ],
    });
    mockFetchTask.mockResolvedValueOnce({
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
        nlp_provider: 'openrouter',
        nlp_model: 'openai/gpt-4.1-mini',
        attribution_provider: 'openrouter',
        attribution_model: 'openai/gpt-4.1-mini',
        cache_status: 'hit',
      },
      error: null,
    });

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await waitFor(() => {
      expect(screen.getByText(/reuse an existing analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/44 characters · 63 chapters · 4 quotes/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/newest attribution cache/i)).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /use selected cache/i }));

    expect(mockAnalyzeBook).toHaveBeenCalledWith(
      expect.objectContaining({
        nlp_provider: 'openrouter',
        nlp_model: 'openai/gpt-4.1-mini',
        attribution_provider: 'openrouter',
        attribution_model: 'openai/gpt-4.1-mini',
        use_cache: true,
      })
    );
    await waitFor(() => {
      expect(screen.getByText(/analysis source: cached result/i)).toBeInTheDocument();
    });
  });

  it('allows manual model entry when provider model discovery is unsupported', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockUseProviderModels.mockReturnValue({
      models: [],
      loading: false,
      error: 'This kenkui runtime does not support provider model discovery. Upgrade kenkui and try again.',
    });

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    const modelInput = screen.getByLabelText(/nlp model/i);
    await userEvent.clear(modelInput);
    await userEvent.type(modelInput, 'llama3.2:latest');
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    expect(mockAnalyzeBook).toHaveBeenCalledWith(
      expect.objectContaining({
        nlp_model: 'llama3.2:latest',
        attribution_model: 'llama3.2:latest',
      })
    );
  });

  it('passes the selected character discovery method to analysis', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await userEvent.selectOptions(screen.getByLabelText(/character discovery/i), 'spacy');
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    expect(mockAnalyzeBook).toHaveBeenCalledWith(
      expect.objectContaining({
        discovery_method: 'spacy',
        nlp_provider: 'ollama',
        attribution_provider: 'ollama',
      })
    );
  });

  it('surfaces malformed analysis results instead of crashing the page', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchTask.mockResolvedValue({
      task_id: 'analysis-1',
      type: 'full_analysis',
      status: 'completed',
      progress: 100,
      message: 'Done',
      result: {
        book_hash: 'hash123',
        annotated_chapters_path: '/cache/annotated.json',
        roster_cache_path: null,
        nlp_provider: 'ollama',
        nlp_model: 'llama3.2',
        attribution_provider: 'ollama',
        attribution_model: 'llama3.2',
        cache_status: 'miss',
      },
      error: null,
    });

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis completed without a character roster/i)).toBeInTheDocument();
    });
    expect(mockSuggestCast).not.toHaveBeenCalled();
  });

  it('shows series selector in multi-voice mode', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchSeries.mockResolvedValue({
      series: [{ slug: 'hp', name: 'Harry Potter' }],
      total: 1,
    });

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/series \(optional\)/i)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /harry potter/i })).toBeInTheDocument();
    });
  });

  it('shows series selector in single-voice mode and passes seriesSlug metadata', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchSeries.mockResolvedValue({
      series: [{ slug: 'hp', name: 'Harry Potter' }],
      total: 1,
    });
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText(/series \(optional\)/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/series \(optional\)/i), 'hp');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({
      narrationMode: 'single',
      seriesSlug: 'hp',
    }));
  });

  it('creates a new inline series and selects it', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchSeries.mockResolvedValue({ series: [], total: 0 });
    mockCreateEmptySeries.mockResolvedValue({ slug: 'the-expanse', name: 'The Expanse' });

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/new series name/i), 'The Expanse');
    await userEvent.click(screen.getByRole('button', { name: /create series/i }));

    expect(mockCreateEmptySeries).toHaveBeenCalledWith('The Expanse');
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /the expanse/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/series \(optional\)/i)).toHaveValue('the-expanse');
    });
  });

  it('displays narrator as an editable cast row in multi-voice mode', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    await waitFor(() => expect(screen.getByText('Narrator')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/voice for narrator/i), 'dave');
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({
      voice: 'dave',
      speakerVoices: expect.objectContaining({ NARRATOR: 'dave' }),
    }));
  });

  it('displays gender_pronoun for each character in cast table', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      // gender_pronoun 'she' should appear in the character row
      expect(screen.getByText(/she/)).toBeInTheDocument();
    });
  });

  it('passes seriesSlug in onNext payload when series is selected', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    mockFetchSeries.mockResolvedValue({
      series: [{ slug: 'hp', name: 'Harry Potter' }],
      total: 1,
    });
    const onNext = vi.fn();

    render(<Step3Voice filePath="/books/great.epub" onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /multi.voice/i }));
    await waitFor(() => expect(screen.getByLabelText(/series \(optional\)/i)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/series \(optional\)/i), 'hp');
    await userEvent.click(screen.getByRole('button', { name: /analyze cast/i }));

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ seriesSlug: 'hp' }));
  });
});
