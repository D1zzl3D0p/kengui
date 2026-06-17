import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateConfig } from './config';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('config api', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('patches the config object directly to /config', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ config: { chapter_threads: 8 } }),
    });

    await updateConfig({ chapter_threads: 8 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/config$/),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ chapter_threads: 8 }),
      })
    );
  });
});
