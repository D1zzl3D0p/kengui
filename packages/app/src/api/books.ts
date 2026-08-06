import { apiRequest } from './client';
import { useConnectionStore } from '../store/connection';
import { parseBookCloud, filterChaptersCloud } from './cloudBooks';
import { isBrowserFilePath } from '../platform';
import type { TaskResponse } from './tasks';
import type { Schemas } from './schemas';

export type ChapterSummary = Schemas['ChapterSummaryModel'];

// Server schema plus a client-side `book_id` injected in hosted mode.
export type BookParseResponse = Schemas['BookParseResponse'] & { book_id?: string };

export type ChapterPreset = Schemas['ChapterPreset'];

export type ChapterFilterResponse = Schemas['ChapterFilterResponse'];

export interface AnalysisCharacter {
  character_id: string;
  display_name: string;
  quote_count: number;
  mention_count: number;
  gender_pronoun: string;
}

export interface AnalysisResult {
  characters: AnalysisCharacter[];
  book_hash: string;
  annotated_chapters_path: string;
  roster_cache_path: string | null;
  nlp_provider: string;
  nlp_model: string;
  attribution_provider: string;
  attribution_model: string;
  cache_status: string;
}

export type AnalysisCacheCandidate = Schemas['BookCacheCandidate'];

export type AnalysisCacheCandidatesResponse = Schemas['BookCacheCandidatesResponse'];

// `use_cache` has a server-side default, so it is optional for callers.
export type BookAnalyzeRequest = Omit<Schemas['BookAnalyzeRequest'], 'use_cache'> & {
  use_cache?: boolean;
};

export const parseBook = (ebook_path: string): Promise<BookParseResponse> => {
  if (useConnectionStore.getState().serverMode === 'hosted') {
    return parseBookCloud(ebook_path);
  }
  if (isBrowserFilePath(ebook_path)) {
    return Promise.reject(new Error(
      'Browser uploads require Kengui Cloud. Custom servers currently accept only files already available on the server.'
    ));
  }
  return apiRequest<BookParseResponse>('/books/parse', {
    method: 'POST',
    body: JSON.stringify({ ebook_path }),
  });
};

export const filterChapters = (
  book_hash: string,
  preset: ChapterPreset,
  book_id?: string
): Promise<ChapterFilterResponse> => {
  if (useConnectionStore.getState().serverMode === 'hosted') {
    if (!book_id) return Promise.reject(new Error('book_id is required for filterChapters in hosted mode.'));
    return filterChaptersCloud(book_id, { preset, included: [], excluded: [] });
  }
  return apiRequest<ChapterFilterResponse>('/books/chapters/filter', {
    method: 'POST',
    body: JSON.stringify({
      book_hash,
      chapter_selection: { preset, included: [], excluded: [] },
    }),
  });
};

export const analyzeBook = (request: BookAnalyzeRequest) =>
  apiRequest<TaskResponse<AnalysisResult>>('/books/analyze', {
    method: 'POST',
    body: JSON.stringify(request),
  });

export const fetchAnalysisCaches = (request: BookAnalyzeRequest) =>
  apiRequest<AnalysisCacheCandidatesResponse>('/books/analyze/caches', {
    method: 'POST',
    body: JSON.stringify(request),
  });
