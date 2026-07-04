import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeCommands } from '../platform';
import { cloudRequest, CloudApiError } from './cloudClient';
import { parseBookCloud, filterChaptersCloud } from './cloudBooks';

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
    // No file upload or parse-book call on dedup hit
    expect(nativeCommands.signedUploadFile).not.toHaveBeenCalled();
    expect(cloudRequest).toHaveBeenCalledTimes(1);
  });

  it('uploads file and calls parse-book on non-dedup path', async () => {
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-456',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
        source_key: 'books/book-456.epub',
      })
      .mockResolvedValueOnce(mockBook);

    const result = await parseBookCloud('/books/great.epub');

    expect(nativeCommands.signedUploadFile).toHaveBeenCalledWith({
      path: '/books/great.epub',
      url: 'https://storage.example/upload?sig=abc',
      contentType: 'application/epub+zip',
    });
    expect(cloudRequest).toHaveBeenCalledWith('parse-book', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ book_id: 'book-456' }),
    }));
    expect(result).toEqual({ ...mockBook, book_id: 'book-456' });
  });

  it('propagates CloudApiError from parse-book (422)', async () => {
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        book_id: 'book-789',
        status: 'awaiting_upload',
        upload_url: 'https://storage.example/upload?sig=abc',
      })
      .mockRejectedValueOnce(new CloudApiError(422, 'Parse failed: unsupported format'));

    await expect(parseBookCloud('/books/great.epub')).rejects.toMatchObject({
      status: 422,
      message: 'Parse failed: unsupported format',
    });
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
