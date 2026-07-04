import { nativeCommands } from '../platform';
import { cloudRequest } from './cloudClient';
import type { BookParseResponse, ChapterFilterResponse, ChapterPreset } from './books';

export interface ChapterSelectionBody {
  preset: ChapterPreset;
  included: number[];
  excluded: number[];
}

interface UploadBookResponse {
  book_id: string;
  status: 'parsed' | 'awaiting_upload';
  book?: BookParseResponse;
  upload_url?: string;
  source_key?: string;
}

export async function parseBookCloud(
  ebookPath: string
): Promise<BookParseResponse & { book_id: string }> {
  const [stat, contentHash] = await Promise.all([
    nativeCommands.fileStat(ebookPath),
    nativeCommands.fileSha256(ebookPath),
  ]);

  const uploadBook = await cloudRequest<UploadBookResponse>('upload-book', {
    method: 'POST',
    body: JSON.stringify({
      content_hash: contentHash,
      size_bytes: stat.byteSize,
      filename: stat.filename,
    }),
  });

  if (uploadBook.status === 'parsed' && uploadBook.book) {
    return { ...uploadBook.book, book_id: uploadBook.book_id };
  }

  // Not a dedup hit — PUT the file then parse
  if (!uploadBook.upload_url) {
    throw new Error('Cloud upload-book response missing upload_url.');
  }

  await nativeCommands.signedUploadFile({
    path: stat.path,
    url: uploadBook.upload_url,
    contentType: stat.contentType,
  });

  const parsed = await cloudRequest<BookParseResponse>('parse-book', {
    method: 'POST',
    body: JSON.stringify({ book_id: uploadBook.book_id }),
  });

  return { ...parsed, book_id: uploadBook.book_id };
}

export async function filterChaptersCloud(
  bookId: string,
  selection: ChapterSelectionBody
): Promise<ChapterFilterResponse> {
  return cloudRequest<ChapterFilterResponse>('filter-chapters', {
    method: 'POST',
    body: JSON.stringify({ book_id: bookId, chapter_selection: selection }),
  });
}
