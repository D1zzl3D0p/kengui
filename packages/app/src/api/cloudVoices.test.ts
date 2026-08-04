import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudRequest } from './cloudClient';
import { fetchCloudVoices, suggestCloudCast } from './cloudVoices';

vi.mock('./cloudClient', () => ({
  cloudRequest: vi.fn(),
}));

const phraseCatalog = [
  {
    phrase_id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    text: 'It is a truth universally acknowledged.',
    source_url: 'https://www.gutenberg.org/ebooks/1342',
  },
  {
    phrase_id: 'moby-dick',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    text: 'Call me Ishmael.',
    source_url: 'https://www.gutenberg.org/ebooks/2701',
  },
  {
    phrase_id: 'alice-in-wonderland',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    text: 'Alice was beginning to get very tired.',
    source_url: 'https://www.gutenberg.org/ebooks/11',
  },
];

const previews = phraseCatalog.map((phrase) => ({
  phrase_id: phrase.phrase_id,
  audio_url: `https://voices.example.test/alba/${phrase.phrase_id}.mp3`,
  content_type: 'audio/mpeg',
  duration_ms: 1200,
  sha256: 'a'.repeat(64),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cloud voices', () => {
  it('loads and validates the hosted voice catalog', async () => {
    vi.mocked(cloudRequest).mockResolvedValue({
      voices: [{
        name: 'alba',
        source: 'pocket_tts_builtin',
        description: 'Alba',
        display_label: 'Alba',
        excluded: false,
        previews,
      }],
      total: 1,
      phrase_catalog: phraseCatalog,
      default_phrase_id: 'pride-and-prejudice',
    });

    const result = await fetchCloudVoices();

    expect(cloudRequest).toHaveBeenCalledWith('list-voices');
    expect(result.phrase_catalog).toHaveLength(3);
    expect(result.voices[0]?.previews).toEqual(previews);
  });

  it.each([
    'http://voices.example.test/alba/sample.mp3',
    'r2://voice-previews/alba/sample.mp3',
    'not a url',
  ])('rejects unsafe preview URL %s', async (audioUrl) => {
    vi.mocked(cloudRequest).mockResolvedValue({
      voices: [{
        name: 'alba',
        source: 'pocket_tts_builtin',
        description: 'Alba',
        display_label: 'Alba',
        excluded: false,
        previews: [{ ...previews[0], audio_url: audioUrl }],
      }],
      total: 1,
      phrase_catalog: phraseCatalog,
      default_phrase_id: 'pride-and-prejudice',
    });

    await expect(fetchCloudVoices()).rejects.toThrow(/secure HTTPS URL/i);
  });

  it('forwards cast requests unchanged', async () => {
    vi.mocked(cloudRequest).mockResolvedValue({
      speaker_voices: { alice: 'alba' },
      warnings: [],
    });
    const input = {
      roster: [{ name: 'alice', pronoun: 'she', quote_count: 4, mention_count: 12 }],
      excluded_voices: ['marius'],
      default_voice: 'alba',
    };

    await expect(suggestCloudCast(input)).resolves.toEqual({
      speaker_voices: { alice: 'alba' },
      warnings: [],
    });
    expect(cloudRequest).toHaveBeenCalledWith('suggest-cast', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('preserves cloud request errors', async () => {
    const error = Object.assign(new Error('Hosted catalog unavailable.'), { status: 502 });
    vi.mocked(cloudRequest).mockRejectedValue(error);

    await expect(fetchCloudVoices()).rejects.toBe(error);
  });
});
