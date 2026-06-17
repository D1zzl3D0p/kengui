import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Voices from './Voices';
import {
  auditionAudioUrl,
  auditionVoice,
  excludeVoice,
  fetchVoices,
} from '../api/voices';
import { fetchTask } from '../api/tasks';

vi.mock('../api/voices', () => ({
  fetchVoices: vi.fn(),
  excludeVoice: vi.fn(),
  includeVoice: vi.fn(),
  auditionVoice: vi.fn(),
  downloadCompiledVoices: vi.fn(),
  auditionAudioUrl: vi.fn(),
}));

vi.mock('../api/tasks', () => ({
  fetchTask: vi.fn(),
}));

const voices = [
  {
    name: 'alba',
    source: 'kenkui_compiled',
    gender: 'female',
    accent: 'en-us',
    dataset: 'set-a',
    speaker_id: '001',
    description: 'Clear female voice',
    display_label: 'Alba (female, en-us)',
    excluded: false,
  },
  {
    name: 'dave',
    source: 'kenkui_compiled',
    gender: 'male',
    accent: 'en-gb',
    dataset: 'set-b',
    speaker_id: '002',
    description: 'British male voice',
    display_label: 'Dave (male, en-gb)',
    excluded: false,
  },
];

function renderVoices() {
  return render(
    <MemoryRouter>
      <Voices />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchVoices).mockResolvedValue({ voices, total: voices.length });
  vi.mocked(excludeVoice).mockResolvedValue({ voice_id: 'alba', pool_enabled: false });
  vi.mocked(auditionVoice).mockResolvedValue({
    task_id: 'audition-1',
    type: 'audition',
    status: 'pending',
    progress: 0,
    message: 'Queued',
    result: null,
    error: null,
  });
  vi.mocked(fetchTask).mockResolvedValue({
    task_id: 'audition-1',
    type: 'audition',
    status: 'completed',
    progress: 100,
    message: 'Done',
    result: { voice_id: 'alba', audio_path: '/tmp/alba.wav' },
    error: null,
  });
  vi.mocked(auditionAudioUrl).mockReturnValue('http://localhost/audio.wav');
});

describe('Voices', () => {
  it('filters voices by search', async () => {
    renderVoices();

    expect(await screen.findByText('Alba (female, en-us)')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'dave');

    expect(screen.queryByText('Alba (female, en-us)')).not.toBeInTheDocument();
    expect(screen.getByText('Dave (male, en-gb)')).toBeInTheDocument();
  });

  it('excludes a voice and auditions audio through task polling', async () => {
    renderVoices();

    expect(await screen.findByText('Alba (female, en-us)')).toBeInTheDocument();

    const excludeButton = screen.getAllByRole('button', { name: /exclude/i })[0];
    expect(excludeButton).toBeDefined();
    await userEvent.click(excludeButton!);
    expect(excludeVoice).toHaveBeenCalledWith('alba');

    const auditionButton = screen.getAllByRole('button', { name: /audition/i })[0];
    expect(auditionButton).toBeDefined();
    await userEvent.click(auditionButton!);

    await waitFor(() => {
      expect(fetchTask).toHaveBeenCalledWith('audition-1');
      expect(screen.getByText(/completed 100%/i)).toBeInTheDocument();
    });
  });
});
