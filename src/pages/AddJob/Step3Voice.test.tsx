import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Step3Voice from './Step3Voice';
import type { VoiceListResponse } from '../../api/voices';

vi.mock('../../api/voices', () => ({
  fetchVoices: vi.fn(),
}));

import { fetchVoices } from '../../api/voices';
const mockFetchVoices = fetchVoices as ReturnType<typeof vi.fn>;

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
  });

  it('loads and displays voices in single mode by default', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);

    render(<Step3Voice onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
      expect(screen.getByText('Dave (male, en-gb)')).toBeInTheDocument();
    });

    // Excluded voice should not appear
    expect(screen.queryByText('Excluded (female, en-us)')).not.toBeInTheDocument();
  });

  it('switching to multi-voice hides voice list and shows NLP mode selector', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);

    render(<Step3Voice onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    const multiButton = screen.getByRole('button', { name: /multi.voice/i });
    await userEvent.click(multiButton);

    // Voice list should be gone
    expect(screen.queryByText('Alba (female, en-us)')).not.toBeInTheDocument();
    // NLP mode selector should appear
    expect(screen.getByText(/NLP mode/i)).toBeInTheDocument();
  });

  it('Next button calls onNext with selected voice in single mode', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    // Select dave
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'dave');

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith({ narrationMode: 'single', voice: 'dave' });
  });

  it('Next button calls onNext with multi mode and nlp_mode', async () => {
    mockFetchVoices.mockResolvedValue(mockVoiceList);
    const onNext = vi.fn();

    render(<Step3Voice onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByText('Alba (female, en-us)')).toBeInTheDocument();
    });

    const multiButton = screen.getByRole('button', { name: /multi.voice/i });
    await userEvent.click(multiButton);

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ narrationMode: 'multi' })
    );
  });
});
