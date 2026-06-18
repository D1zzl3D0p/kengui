import { apiRequest } from './client';
import type { TaskResponse } from './tasks';

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

export interface BookAnalyzeRequest {
  ebook_path: string;
  nlp_model?: string | null;
  nlp_provider?: string | null;
  discovery_method?: string | null;
  attribution_provider?: string | null;
  attribution_model?: string | null;
  use_cache?: boolean;
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

export const analyzeBook = (request: BookAnalyzeRequest) =>
  apiRequest<TaskResponse<AnalysisResult>>('/books/analyze', {
    method: 'POST',
    body: JSON.stringify(request),
  });
