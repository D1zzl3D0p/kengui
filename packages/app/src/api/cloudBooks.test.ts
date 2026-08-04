import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeCommands } from '../platform';
import { cloudRequest, CloudApiError } from './cloudClient';
import {
  parseBookCloud,
  filterChaptersCloud,
  analyzeBookCloud,
  getBookAnalysisCloud,
  mapCloudAnalysisToCharacters,
  pollCloudAnalysis,
} from './cloudBooks';

vi.mock('../platform', () => ({
  nativeCommands: {
    fileStat: vi.fn(),
    fileSha256: vi.fn(),
    signedUploadFile: vi.fn(),
  },
}));

vi.mock('./cloudClient', () => ({
  cloudRequest: vi.fn(),
  CloudApiError: class CloudApiError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
      this.name = 'CloudApiError';
    }
  },
}));

const mockStat = {
  path: '/books/great.epub',
  filename: 'great.epub',
  byteSize: 1024,
  contentType: 'application/epub+zip',
};

const mockBook = {
  book_hash: 'hash-abc',
  metadata: { title: 'Great Book' },
  chapters: [],
  total_chapters: 5,
  total_word_count: 50000,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(nativeCommands.fileStat).mockResolvedValue(mockStat);
  vi.mocked(nativeCommands.fileSha256).mockResolvedValue('deadbeef');
  vi.mocked(nativeCommands.signedUploadFile).mockResolvedValue(undefined);
});

describe('parseBookCloud', () => {
  it('returns book data directly on dedup hit (status: parsed)', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      book_id: 'book-123',
      status: 'parsed',
      book: mockBook,
    });

    const result = await parseBookCloud('/books/great.epub');

    expect(result).toEqual({ ...mockBook, book_id: 'book-123' });
    // upload-book was called with correct fields
    expect(cloudRequest).toHaveBeenCalledWith('upload-book', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ content_hash: 'deadbeef', size_bytes: 1024, filename: 'great.epub' }),
    }));
    // No file upload or confirm-book-upload call on dedup hit
    expect(nativeCommands.signedUploadFile).not.toHaveBeenCalled();
    expect(cloudRequest).toHaveBeenCalledTimes(1);
  });

  it('uploads file and returns immediately on confirm 200 parsed', async () => {
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-456',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
        source_key: 'books/book-456.epub',
      })
      .mockResolvedValueOnce({
        book_id: 'book-456',
        status: 'parsed',
        book: mockBook,
      });

    const result = await parseBookCloud('/books/great.epub');

    expect(nativeCommands.signedUploadFile).toHaveBeenCalledWith({
      path: '/books/great.epub',
      url: 'https://storage.example/upload?sig=abc',
      contentType: 'application/epub+zip',
    });
    expect(cloudRequest).toHaveBeenCalledWith('confirm-book-upload', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ book_id: 'book-456' }),
    }));
    expect(cloudRequest).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ...mockBook, book_id: 'book-456' });
  });

  it('polls get-book after 202 and resolves when parsed', async () => {
    vi.useFakeTimers();
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-456',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
      })
      .mockResolvedValueOnce({ book_id: 'book-456', status: 'parsing' })
      .mockResolvedValueOnce({ book_id: 'book-456', status: 'parsing' })
      .mockResolvedValueOnce({ book_id: 'book-456', status: 'parsed', book: mockBook });

    const promise = parseBookCloud('/books/great.epub');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ...mockBook, book_id: 'book-456' });
    expect(cloudRequest).toHaveBeenCalledWith('get-book', expect.objectContaining({
      body: JSON.stringify({ book_id: 'book-456' }),
    }));
    vi.useRealTimers();
  });

  it('rejects with stable copy when get-book returns parse_failed', async () => {
    vi.useFakeTimers();
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-789',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
      })
      .mockResolvedValueOnce({ book_id: 'book-789', status: 'parsing' })
      .mockResolvedValueOnce({
        book_id: 'book-789',
        status: 'parse_failed',
        error_message: 'Unsupported DRM format',
      });

    const promise = parseBookCloud('/books/great.epub').catch((e) => { throw e; });
    const assertion = expect(promise).rejects.toThrow('Book parsing failed.');
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it('rejects with timeout error after 120 seconds', async () => {
    vi.useFakeTimers();
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-timeout',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
      });
    // Always return parsing so it never resolves naturally
    vi.mocked(cloudRequest).mockResolvedValue({ book_id: 'book-timeout', status: 'parsing' });

    const promise = parseBookCloud('/books/great.epub');
    const assertion = expect(promise).rejects.toThrow('timed out after 120 seconds');
    await vi.advanceTimersByTimeAsync(121_000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('filterChaptersCloud', () => {
  it('calls filter-chapters with book_id and selection', async () => {
    const filterResponse = {
      included_indices: [1, 2],
      chapter_count: 2,
      estimated_word_count: 10000,
      chapters: [],
    };
    vi.mocked(cloudRequest).mockResolvedValueOnce(filterResponse);

    const selection = { preset: 'content-only' as const, included: [], excluded: [] };
    const result = await filterChaptersCloud('book-123', selection);

    expect(cloudRequest).toHaveBeenCalledWith('filter-chapters', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ book_id: 'book-123', chapter_selection: selection }),
    }));
    expect(result).toEqual(filterResponse);
  });
});

describe('analyzeBookCloud', () => {
  it('posts analyze-book with book_id and options, returns invocation_id', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      invocation_id: 'inv-abc',
      status: 'queued',
    });

    const result = await analyzeBookCloud('book-123', {
      nlp_provider: 'openai',
      nlp_model: 'gpt-4o',
    });

    expect(cloudRequest).toHaveBeenCalledWith('analyze-book', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ book_id: 'book-123', options: { nlp_provider: 'openai', nlp_model: 'gpt-4o' } }),
    }));
    expect(result).toEqual({ invocation_id: 'inv-abc', status: 'queued' });
  });

  it('surfaces a clear error on 409 analysis_already_active', async () => {
    vi.mocked(cloudRequest).mockRejectedValueOnce(
      new CloudApiError(409, 'analysis_already_active')
    );

    await expect(analyzeBookCloud('book-123')).rejects.toMatchObject({
      status: 409,
      message: 'analysis_already_active',
    });
  });
});

describe('getBookAnalysisCloud', () => {
  it('posts get-book-analysis with invocation_id and returns response', async () => {
    const mockResponse = {
      status: 'running',
      progress: { percent: 42, message: 'Discovering characters' },
    };
    vi.mocked(cloudRequest).mockResolvedValueOnce(mockResponse);
    const result = await getBookAnalysisCloud('inv-abc');
    expect(cloudRequest).toHaveBeenCalledWith('get-book-analysis', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ invocation_id: 'inv-abc' }),
    }));
    expect(result).toEqual({ status: 'running', progress: {
      percent: 42, message: 'Cloud analysis is running',
    } });
  });

  it('normalizes runtime_status and strips unknown fields', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      status: 'running', unknown: 'secret', progress: { percent: 20, message: 'Working', unknown: true },
      runtime_status: {
        status: 'running', observed_at: '2026-08-04T01:00:00Z', unknown: 'secret',
        progress: { stage: 'nlp', percent: 20, updated_at: '2026-08-04T00:59:50Z', age_seconds: 10 },
        heartbeat: { at: '2026-08-04T00:59:58Z', age_seconds: 2, timeout_seconds: 30 },
        watchdog: { state: 'healthy' },
      },
    });
    expect(await getBookAnalysisCloud('inv')).toEqual({
      status: 'running', progress: { percent: 20, message: 'Cloud analysis is running' },
      runtimeStatus: {
        status: 'running', observedAt: '2026-08-04T01:00:00Z',
        progress: { stage: 'nlp', percent: 20, updatedAt: '2026-08-04T00:59:50Z', ageSeconds: 10 },
        heartbeat: { at: '2026-08-04T00:59:58Z', ageSeconds: 2, timeoutSeconds: 30 },
        watchdog: { state: 'healthy' },
      },
    });
  });

  it('drops malformed runtime fields without throwing', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ status: 'running', runtime_status: {
      status: {}, observed_at: 'bad', progress: { percent: Infinity }, watchdog: { state: 'bad' },
    } });
    expect((await getBookAnalysisCloud('inv')).runtimeStatus).toEqual({ status: null });
  });

  it.each([NaN, Infinity, -1, 101])('drops malformed top-level progress percent %s', async (percent) => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      status: 'running', progress: { stage: 42, percent, message: 'Working' },
    });
    expect((await getBookAnalysisCloud('inv')).progress).toEqual({ message: 'Cloud analysis is running' });
  });

  it('removes arbitrary analysis control text while preserving character names', async () => {
    const secret = 'Bearer SECRET /Users/alice/private.epub';
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      status: secret, progress: { stage: secret, percent: 37, message: secret }, error_message: secret,
      runtime_status: { failure: { code: secret, message: secret } },
      result: { characters: [{ character_id: 'c1', display_name: 'Alice Secretkeeper' }] },
    });
    const result = await getBookAnalysisCloud('inv-hostile');
    expect(result).toMatchObject({
      status: 'unknown', progress: { percent: 37, message: 'Cloud analysis status unavailable' },
      result: { characters: [{ display_name: 'Alice Secretkeeper' }] },
    });
    expect(result.error_message).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('mapCloudAnalysisToCharacters', () => {
  it('maps cloud result characters to MappedCharacter shape', () => {
    const result = mapCloudAnalysisToCharacters({
      characters: [
        { character_id: 'c1', display_name: 'Alice', quote_count: 10, mention_count: 20, gender_pronoun: 'she/her' },
        { character_id: 'c2', display_name: 'Bob' },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      character_id: 'c1',
      display_name: 'Alice',
      quote_count: 10,
      mention_count: 20,
      gender_pronoun: 'she/her',
    });
    // Missing fields get defaults
    expect(result[1]).toEqual({
      character_id: 'c2',
      display_name: 'Bob',
      quote_count: 0,
      mention_count: 0,
      gender_pronoun: '',
    });
  });

  it('throws if characters is missing', () => {
    expect(() => mapCloudAnalysisToCharacters({})).toThrow('character roster');
  });
});

describe('pollCloudAnalysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls until completed and calls onUpdate each tick', async () => {
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({ status: 'queued', progress: { percent: 0, message: 'Queued' } })
      .mockResolvedValueOnce({ status: 'running', progress: { stage: 'analysis_extraction', percent: 50, message: 'Halfway' } })
      .mockResolvedValueOnce({
        status: 'completed',
        progress: { percent: 100, message: 'Done' },
        result: { characters: [{ character_id: 'c1', display_name: 'Alice' }] },
      });

    const updates: Array<{ status: string; percent: number }> = [];
    const promise = pollCloudAnalysis('inv-abc', (p) => updates.push(p), 0);

    // Drain microtasks for all three ticks
    await vi.runAllTimersAsync();
    const completed = await promise;

    expect(completed.status).toBe('completed');
    expect(updates).toHaveLength(3);
    expect(updates[1]).toMatchObject({ status: 'running', percent: 50, message: 'Extracting book structure' });
  });

  it('stops polling on failed status', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      status: 'failed',
      error_message: 'NLP error',
    });

    const promise = pollCloudAnalysis('inv-fail', () => {}, 0);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('failed');
    expect(result.error_message).toBe('Cloud analysis failed.');
    expect(cloudRequest).toHaveBeenCalledTimes(1);
  });

  it('stops only client polling at the safety timeout without claiming worker failure', async () => {
    vi.mocked(cloudRequest).mockResolvedValue({ status: 'running' });
    const promise = pollCloudAnalysis('inv-live', () => {}, 1000, 2500);
    const assertion = expect(promise).rejects.toThrow(/client polling stopped.*worker may still be running.*does not indicate worker failure/i);
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it('bounds a never-resolving get-book-analysis request by the safety timeout', async () => {
    vi.mocked(cloudRequest).mockImplementation(() => new Promise(() => {}));
    const promise = pollCloudAnalysis('inv-stuck', () => {}, 1000, 2500);
    const assertion = expect(promise).rejects.toThrow(/client polling stopped.*does not indicate worker failure/i);
    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues through unknown and retrying statuses until completed with a result', async () => {
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({ status: 'future_state' })
      .mockResolvedValueOnce({ status: 'retrying' })
      .mockResolvedValueOnce({ status: 'completed' })
      .mockResolvedValueOnce({ status: 'completed', result: { characters: [] } });
    const promise = pollCloudAnalysis('inv-forward', () => {}, 10, 5000);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({ status: 'completed', result: { characters: [] } });
    expect(cloudRequest).toHaveBeenCalledTimes(4);
  });

  it('replaces arbitrary provider polling errors with stable copy', async () => {
    const secret = 'Bearer SECRET provider traceback';
    vi.mocked(cloudRequest).mockRejectedValueOnce(new Error(secret));
    const promise = pollCloudAnalysis('inv-error', () => {}, 0);
    await expect(promise).rejects.toThrow('Cloud analysis status check failed. Please retry.');
    await expect(promise).rejects.not.toThrow(secret);
  });

  it('returns cancelled as an explicit terminal outcome', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ status: 'cancelled', error_message: 'Cancelled by user' });
    await expect(pollCloudAnalysis('inv-cancelled', () => {}, 0)).resolves.toMatchObject({
      status: 'cancelled', error_message: 'Cloud analysis was cancelled.',
    });
  });
});
