import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import { analyzeBook, fetchAnalysisCaches } from './books';

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
