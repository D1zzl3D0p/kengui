import { open } from '@tauri-apps/plugin-dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pickBookFile } from './nativeDialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('pickBookFile', () => {
  beforeEach(() => {
    vi.mocked(open).mockReset();
  });

  it('returns a selected book path', async () => {
    vi.mocked(open).mockResolvedValue('/tmp/book.epub');

    await expect(pickBookFile()).resolves.toBe('/tmp/book.epub');
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        filters: expect.any(Array),
      })
    );
  });

  it('returns null when selection is cancelled or unavailable', async () => {
    vi.mocked(open).mockResolvedValueOnce(null);
    await expect(pickBookFile()).resolves.toBeNull();

    vi.mocked(open).mockRejectedValueOnce(new Error('unavailable'));
    await expect(pickBookFile()).resolves.toBeNull();
  });
});
