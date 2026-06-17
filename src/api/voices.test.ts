import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import {
  auditionAudioUrl,
  auditionVoice,
  downloadCompiledVoices,
  excludeVoice,
  includeVoice,
  suggestCast,
} from './voices';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({
    serverUrl: 'http://localhost:45365',
    serverMode: 'local',
    connectionStatus: 'connected',
  });
  mockFetch.mockReset();
});

describe('voices api', () => {
  it('excludes and includes voices', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ voice_id: 'alba', pool_enabled: false }),
    });

    await excludeVoice('alba');
    await includeVoice('alba');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:45365/v1/voices/alba/exclude',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:45365/v1/voices/alba/exclude',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('starts audition and download tasks', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          task_id: 'task-1',
          type: 'audition',
          status: 'pending',
          progress: 0,
          message: 'Queued',
          result: null,
          error: null,
        }),
    });

    await auditionVoice({ voice_name: 'alba' });
    await downloadCompiledVoices({ force: true });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:45365/v1/voices/audition',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ voice_name: 'alba' }),
      })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:45365/v1/voices/download/compiled',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ force: true }),
      })
    );
  });

  it('maps analysis characters to the backend cast suggestion shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ speaker_voices: { alice: 'alba' }, warnings: [] }),
    });

    await suggestCast([
      {
        character_id: 'alice',
        display_name: 'Alice',
        quote_count: 3,
        mention_count: 10,
        gender_pronoun: 'she',
      },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/voices/suggest-cast',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          roster: [
            {
              name: 'alice',
              pronoun: 'she',
              quote_count: 3,
              mention_count: 10,
            },
          ],
          excluded_voices: [],
          default_voice: 'alba',
        }),
      })
    );
  });

  it('builds the audition audio URL from the active server', () => {
    expect(auditionAudioUrl('task-1')).toBe(
      'http://localhost:45365/v1/voices/audition/task-1.wav'
    );
  });
});
