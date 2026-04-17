import { apiRequest } from './client';

export interface ChapterSummary {
  index: number;
  title: string;
  word_count: number;
  paragraph_count: number;
  toc_index: number;
  tags: Record<string, unknown>;
}

export interface BookParseResponse {
  book_hash: string;
  metadata: Record<string, unknown>;
  chapters: ChapterSummary[];
  total_chapters: number;
  total_word_count: number;
}

export type ChapterPreset =
  | 'none'
  | 'content-only'
  | 'chapters-only'
  | 'with-parts'
  | 'manual'
  | 'custom';

export interface ChapterFilterResponse {
  included_indices: number[];
  chapter_count: number;
  estimated_word_count: number;
  chapters: ChapterSummary[];
}

export const parseBook = (ebook_path: string) =>
  apiRequest<BookParseResponse>('/books/parse', {
    method: 'POST',
    body: JSON.stringify({ ebook_path }),
  });

export const filterChapters = (book_hash: string, preset: ChapterPreset) =>
  apiRequest<ChapterFilterResponse>('/books/chapters/filter', {
    method: 'POST',
    body: JSON.stringify({
      book_hash,
      chapter_selection: { preset, included: [], excluded: [] },
    }),
  });
