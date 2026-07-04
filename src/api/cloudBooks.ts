import { nativeCommands } from '../platform';
import { cloudRequest } from './cloudClient';
import type { BookParseResponse, ChapterFilterResponse, ChapterPreset } from './books';

// ──────────────────────────────────────────────────────────────────────
// Cloud analysis types
// ──────────────────────────────────────────────────────────────────────

export interface AnalyzeBookCloudOptions {
  nlp_provider?: string;
  nlp_model?: string;
  discovery_method?: string;
  attribution_provider?: string;
  attribution_model?: string;
}

export interface AnalyzeBookCloudResponse {
  invocation_id: string;
  status: 'queued';
}

export type CloudAnalysisStatus = 'queued' | 'running' | 'completed' | 'failed' | string;

export interface CloudAnalysisProgress {
  stage?: string;
  percent?: number;
  message?: string;
}

export interface CloudAnalysisResultCharacter {
  character_id?: string;
  display_name?: string;
  quote_count?: number;
  mention_count?: number;
  gender_pronoun?: string;
}

export interface CloudAnalysisResultData {
  roster_key?: string;
  characters?: CloudAnalysisResultCharacter[];
  timings?: Record<string, unknown>;
}

export interface GetBookAnalysisCloudResponse {
  status: CloudAnalysisStatus;
  progress?: CloudAnalysisProgress;
  result?: CloudAnalysisResultData;
  error_message?: string;
}

export interface CloudAnalysisProgressView {
  status: CloudAnalysisStatus;
  percent: number;
  message: string;
}

// Character shape compatible with AnalysisCharacter from books.ts (no circular import)
export interface MappedCharacter {
  character_id: string;
  display_name: string;
  quote_count: number;
  mention_count: number;
  gender_pronoun: string;
}

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

// ──────────────────────────────────────────────────────────────────────
// Cloud analysis API
// ──────────────────────────────────────────────────────────────────────

export async function analyzeBookCloud(
  bookId: string,
  options?: AnalyzeBookCloudOptions
): Promise<AnalyzeBookCloudResponse> {
  return cloudRequest<AnalyzeBookCloudResponse>('analyze-book', {
    method: 'POST',
    body: JSON.stringify({ book_id: bookId, options }),
  });
}

export async function getBookAnalysisCloud(
  invocationId: string
): Promise<GetBookAnalysisCloudResponse> {
  return cloudRequest<GetBookAnalysisCloudResponse>('get-book-analysis', {
    method: 'POST',
    body: JSON.stringify({ invocation_id: invocationId }),
  });
}

/**
 * Map the cloud analysis result characters to the local AnalysisCharacter shape.
 * Exported for unit testing.
 */
export function mapCloudAnalysisToCharacters(result: CloudAnalysisResultData): MappedCharacter[] {
  if (!Array.isArray(result.characters)) {
    throw new Error('Cloud analysis completed without a character roster. Please retry.');
  }
  return result.characters.map((c, i) => ({
    character_id: c.character_id ?? `char-${i}`,
    display_name: c.display_name ?? 'Unknown',
    quote_count: c.quote_count ?? 0,
    mention_count: c.mention_count ?? 0,
    gender_pronoun: c.gender_pronoun ?? '',
  }));
}

/**
 * Poll get-book-analysis until completed or failed.
 * onUpdate is called after each poll with a simplified progress view.
 * Exported for unit testing.
 */
export async function pollCloudAnalysis(
  invocationId: string,
  onUpdate: (progress: CloudAnalysisProgressView) => void,
  intervalMs = 1200
): Promise<GetBookAnalysisCloudResponse> {
  for (;;) {
    const response = await getBookAnalysisCloud(invocationId);
    onUpdate({
      status: response.status,
      percent: response.progress?.percent ?? 0,
      message: response.progress?.message ?? response.status,
    });
    if (response.status !== 'queued' && response.status !== 'running') {
      return response;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
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
