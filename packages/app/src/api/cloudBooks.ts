import { nativeCommands } from '../platform';
import { cloudRequest } from './cloudClient';
import type { BookParseResponse, ChapterFilterResponse, ChapterPreset } from './books';
import { normalizeRuntimeStatus } from './cloudQueue';
import type { RuntimeStatus } from './queue';
import { computeBackoffInterval, shouldResetPollingBackoff } from '../lib/pollingBackoff';

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

export type CloudAnalysisStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

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
  runtimeStatus?: RuntimeStatus | undefined;
}

export interface CloudAnalysisProgressView {
  status: string;
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

interface ConfirmBookUploadResponse {
  book_id: string;
  status: 'parsed' | 'parsing';
  book?: BookParseResponse;
}

interface GetBookResponse {
  book_id: string;
  status: 'awaiting_upload' | 'uploaded' | 'parsing' | 'parsed' | 'parse_failed';
  book?: BookParseResponse;
  error_message?: string;
}

const ANALYSIS_STATUS_MESSAGES: Readonly<Record<CloudAnalysisStatus, string>> = Object.freeze({
  queued: 'Cloud analysis is queued', running: 'Cloud analysis is running',
  completed: 'Cloud analysis completed', failed: 'Cloud analysis failed',
  cancelled: 'Cloud analysis was cancelled', unknown: 'Cloud analysis status unavailable',
});
const ANALYSIS_STAGE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  preflight: 'Preparing analysis', download: 'Downloading inputs', nlp: 'Analyzing book',
  analysis_extraction: 'Extracting book structure', analysis_attribution: 'Analyzing speaker attribution',
  completed: 'Runtime completed', cancelled: 'Runtime cancelled', failed: 'Runtime failed',
});
const ANALYSIS_STATUSES = new Set<CloudAnalysisStatus>([
  'queued', 'running', 'completed', 'failed', 'cancelled',
]);

function normalizeAnalysisStatus(value: unknown): CloudAnalysisStatus {
  return typeof value === 'string' && ANALYSIS_STATUSES.has(value as CloudAnalysisStatus)
    ? value as CloudAnalysisStatus : 'unknown';
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

  // Not a dedup hit — PUT the file then confirm
  if (!uploadBook.upload_url) {
    throw new Error('Cloud upload-book response missing upload_url.');
  }

  await nativeCommands.signedUploadFile({
    path: stat.path,
    url: uploadBook.upload_url,
    contentType: stat.contentType,
  });

  const confirm = await cloudRequest<ConfirmBookUploadResponse>('confirm-book-upload', {
    method: 'POST',
    body: JSON.stringify({ book_id: uploadBook.book_id }),
  });

  if (confirm.status === 'parsed' && confirm.book) {
    return { ...confirm.book, book_id: confirm.book_id };
  }

  // 202 parsing — poll get-book until parsed or terminal failure
  const timeoutMs = 120_000;
  const intervalMs = 1_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (Date.now() >= deadline) {
      throw new Error('Book parsing timed out after 120 seconds.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));

    const poll = await cloudRequest<GetBookResponse>('get-book', {
      method: 'POST',
      body: JSON.stringify({ book_id: uploadBook.book_id }),
    });

    if (poll.status === 'parsed' && poll.book) {
      return { ...poll.book, book_id: poll.book_id };
    }
    if (poll.status === 'parse_failed' || poll.status === 'uploaded') {
      throw new Error('Book parsing failed.');
    }
  }
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
  invocationId: string,
  signal?: AbortSignal
): Promise<GetBookAnalysisCloudResponse> {
  const raw = await cloudRequest<unknown>('get-book-analysis', {
    method: 'POST',
    body: JSON.stringify({ invocation_id: invocationId }),
    ...(signal ? { signal } : {}),
  });
  return normalizeCloudAnalysisResponse(raw);
}

export function normalizeCloudAnalysisResponse(value: unknown): GetBookAnalysisCloudResponse {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const object = (item: unknown) => typeof item === 'object' && item !== null && !Array.isArray(item)
    ? item as Record<string, unknown> : undefined;
  const progress = object(raw.progress);
  const result = object(raw.result);
  const status = normalizeAnalysisStatus(raw.status);
  const rawStage = typeof progress?.stage === 'string' ? progress.stage : undefined;
  const stage = rawStage && Object.prototype.hasOwnProperty.call(ANALYSIS_STAGE_MESSAGES, rawStage)
    ? rawStage : undefined;
  const characters = Array.isArray(result?.characters)
    ? result.characters.map((item) => {
      const character = object(item) ?? {};
      return {
        ...(typeof character.character_id === 'string' ? { character_id: character.character_id } : {}),
        ...(typeof character.display_name === 'string' ? { display_name: character.display_name } : {}),
        ...(typeof character.quote_count === 'number' && Number.isFinite(character.quote_count) ? { quote_count: character.quote_count } : {}),
        ...(typeof character.mention_count === 'number' && Number.isFinite(character.mention_count) ? { mention_count: character.mention_count } : {}),
        ...(typeof character.gender_pronoun === 'string' ? { gender_pronoun: character.gender_pronoun } : {}),
      };
    }) : undefined;
  const normalizedResult = result ? {
    ...(typeof result.roster_key === 'string' ? { roster_key: result.roster_key } : {}),
    ...(characters ? { characters } : {}),
    ...(object(result.timings) ? { timings: object(result.timings)! } : {}),
  } : undefined;
  const runtimeStatus = raw.runtime_status !== undefined ? normalizeRuntimeStatus(raw.runtime_status) : undefined;
  const errorMessage = status === 'failed'
    ? runtimeStatus?.failure?.message ?? 'Cloud analysis failed.'
    : status === 'cancelled' ? 'Cloud analysis was cancelled.' : undefined;
  return {
    status,
    ...(progress ? { progress: {
      ...(stage ? { stage } : {}),
      ...(typeof progress.percent === 'number' && Number.isFinite(progress.percent) && progress.percent >= 0 && progress.percent <= 100
        ? { percent: progress.percent } : {}),
      message: stage ? ANALYSIS_STAGE_MESSAGES[stage]! : ANALYSIS_STATUS_MESSAGES[status],
    } } : {}),
    ...(normalizedResult ? { result: normalizedResult } : {}),
    ...(errorMessage ? { error_message: errorMessage } : {}),
    ...(raw.runtime_status !== undefined ? { runtimeStatus } : {}),
  };
}

export function normalizeCloudAnalysisProgressView(value: unknown): CloudAnalysisProgressView {
  const normalized = normalizeCloudAnalysisResponse(value);
  return {
    status: normalized.status,
    percent: normalized.progress?.percent ?? 0,
    message: normalized.progress?.message ?? ANALYSIS_STATUS_MESSAGES[normalized.status],
  };
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
  intervalMs = 1200,
  timeoutMs = 15 * 60_000
): Promise<GetBookAnalysisCloudResponse> {
  const timeoutMessage = 'Client polling stopped after the safety timeout. The worker may still be running; this does not indicate worker failure. You can retry checking its status.';
  const deadline = Date.now() + timeoutMs;
  let unchanged = 0;
  let previousRuntime: RuntimeStatus | undefined;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(timeoutMessage);

    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = getBookAnalysisCloud(invocationId, controller?.signal);
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
        controller?.abort();
      }, remaining);
    });
    let response: GetBookAnalysisCloudResponse;
    try {
      response = await Promise.race([request, timeout]);
    } catch (error) {
      if (error instanceof Error && error.message === timeoutMessage) throw error;
      throw new Error('Cloud analysis status check failed. Please retry.');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    onUpdate({
      status: response.status,
      percent: response.progress?.percent ?? 0,
      message: response.progress?.message ?? response.status,
    });
    if (response.status === 'failed' || response.status === 'cancelled') return response;
    if (response.status === 'completed' && response.result) return response;

    const currentRuntime: RuntimeStatus = response.runtimeStatus ?? {
      status: response.status,
      ...(response.progress ? { progress: response.progress } : {}),
    };
    if (previousRuntime) {
      unchanged = shouldResetPollingBackoff(previousRuntime, currentRuntime) ? 0 : unchanged + 1;
    } else {
      unchanged = 0;
    }
    previousRuntime = currentRuntime;
    const delay = computeBackoffInterval(unchanged, {
      initial: intervalMs,
      cap: Math.max(intervalMs, 8000),
    });
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(delay, Math.max(0, deadline - Date.now())))
    );
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
