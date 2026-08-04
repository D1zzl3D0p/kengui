import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import { analyzeBook, fetchAnalysisCaches, parseBook, filterChapters } from './books';

vi.mock('./cloudBooks', () => ({
  parseBookCloud: vi.fn(),
  filterChaptersCloud: vi.fn(),
}));

import { parseBookCloud, filterChaptersCloud } from './cloudBooks';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({
    serverUrl: 'http://localhost:45365',
    serverMode: 'local',
    connectionStatus: 'connected',
  });
  mockFetch.mockReset();
  vi.mocked(parseBookCloud).mockReset();
  vi.mocked(filterChaptersCloud).mockReset();
});

describe('parseBook routing', () => {
  it('calls apiRequest in local mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ book_hash: 'h', metadata: {}, chapters: [], total_chapters: 0, total_word_count: 0 }),
    });

    await parseBook('/books/great.epub');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/books/parse',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ebook_path: '/books/great.epub' }) })
    );
    expect(parseBookCloud).not.toHaveBeenCalled();
  });

  it('calls parseBookCloud in hosted mode', async () => {
    useConnectionStore.setState({ serverMode: 'hosted' });
    vi.mocked(parseBookCloud).mockResolvedValue({
      book_hash: 'h', metadata: {}, chapters: [], total_chapters: 0, total_word_count: 0, book_id: 'book-1',
    });

    const result = await parseBook('/books/great.epub');

    expect(parseBookCloud).toHaveBeenCalledWith('/books/great.epub');
    expect(result.book_id).toBe('book-1');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('filterChapters routing', () => {
  it('calls apiRequest in local mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ included_indices: [], chapter_count: 0, estimated_word_count: 0, chapters: [] }),
    });

    await filterChapters('hash-abc', 'content-only');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/books/chapters/filter',
      expect.objectContaining({ method: 'POST' })
    );
    expect(filterChaptersCloud).not.toHaveBeenCalled();
  });

  it('calls filterChaptersCloud in hosted mode', async () => {
    useConnectionStore.setState({ serverMode: 'hosted' });
    vi.mocked(filterChaptersCloud).mockResolvedValue({
      included_indices: [1], chapter_count: 1, estimated_word_count: 5000, chapters: [],
    });

    const result = await filterChapters('hash-abc', 'content-only', 'book-1');

    expect(filterChaptersCloud).toHaveBeenCalledWith('book-1', {
      preset: 'content-only', included: [], excluded: [],
    });
    expect(result.chapter_count).toBe(1);
  });

  it('throws in hosted mode when book_id is missing', async () => {
    useConnectionStore.setState({ serverMode: 'hosted' });

    await expect(filterChapters('hash-abc', 'content-only')).rejects.toThrow(
      'book_id is required for filterChapters in hosted mode.'
    );
  });
});

describe('books api', () => {
  it('starts a full analysis task', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          task_id: 'task-1',
          type: 'full_analysis',
          status: 'pending',
          progress: 0,
          message: 'Queued',
          result: null,
          error: null,
        }),
    });

    await analyzeBook({
      ebook_path: '/books/great.epub',
      nlp_provider: 'openrouter',
      nlp_model: 'openai/gpt-4.1-mini',
      use_cache: false,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/books/analyze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ebook_path: '/books/great.epub',
          nlp_provider: 'openrouter',
          nlp_model: 'openai/gpt-4.1-mini',
          use_cache: false,
        }),
      })
    );
  });

  it('fetches analysis cache candidates', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ book_hash: 'hash123', candidates: [] }),
    });

    await fetchAnalysisCaches({ ebook_path: '/books/great.epub' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/books/analyze/caches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ebook_path: '/books/great.epub' }),
      })
    );
  });
});
