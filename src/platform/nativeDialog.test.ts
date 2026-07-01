import { open, save } from '@tauri-apps/plugin-dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pickBookFile, saveM4bFile } from './nativeDialog';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe('pickBookFile', () => {
  beforeEach(() => {
    vi.mocked(open).mockReset();
    vi.mocked(save).mockReset();
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

  it('returns a selected M4B save path', async () => {
    vi.mocked(save).mockResolvedValue('/downloads/book.m4b');

    await expect(saveM4bFile('book.m4b')).resolves.toBe('/downloads/book.m4b');
    expect(save).toHaveBeenCalledWith({
      defaultPath: 'book.m4b',
      filters: [{ name: 'M4B Audiobook', extensions: ['m4b'] }],
    });
  });

  it('returns null when the M4B save dialog is cancelled or unavailable', async () => {
    vi.mocked(save).mockResolvedValueOnce(null);
    await expect(saveM4bFile('book.m4b')).resolves.toBeNull();

    vi.mocked(save).mockRejectedValueOnce(new Error('unavailable'));
    await expect(saveM4bFile('book.m4b')).resolves.toBeNull();
  });
});
