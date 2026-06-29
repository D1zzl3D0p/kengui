import { apiRequest } from './client';

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface JobResponse {
  id: string;
  job: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  current_chapter: string;
  eta_seconds: number;
  error_message: string;
  output_path: string;
  started_at: number;
  completed_at: number;
  execution_provider?: string;
  remote_job_id?: string;
  estimated_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  cost_status?: string;
  artifact_uri?: string;
  artifact_source?: string;
  provider_status?: string;
}

export interface QueueResponse {
  items: JobResponse[];
  current_item: JobResponse | null;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

export type NarrationMode = 'single' | 'multi';

export interface ChapterSelection {
  preset: 'none' | 'content-only' | 'chapters-only' | 'with-parts' | 'manual' | 'custom';
  included: number[];
  excluded: number[];
}

export interface JobCreateRequest {
  ebook_path: string;
  voice?: string;
  chapter_selection: ChapterSelection | null;
  narration_mode: NarrationMode;
  name: string | null;
  output_path: string | null;
  tts_execution_mode?: 'local' | 'modal';
  modal_endpoint?: string | null;
  modal_environment?: string | null;
  speaker_voices?: Record<string, string>;
  annotated_chapters_path?: string | null;
  chapter_voices?: Record<string, string>;
  roster_cache_path?: string | null;
  series_slug?: string | null;
  job_nlp_provider?: string | null;
  job_nlp_model?: string | null;
  job_temp?: number | null;
  job_lsd_decode_steps?: number | null;
  job_noise_clamp?: number | null;
  job_eos_threshold?: number | null;
  job_post_processing_enabled?: boolean | null;
  job_m4b_bitrate?: string | null;
  job_pause_line_ms?: number | null;
  job_pause_chapter_ms?: number | null;
  job_speak_chapter_titles?: boolean | null;
  job_pause_before_chapter_title_ms?: number | null;
  job_pause_after_chapter_title_ms?: number | null;
  job_frames_after_eos?: number | null;
  job_apostrophe_mode?: string | null;
  job_nlp_execution_mode?: 'local' | 'modal' | null;
  job_attribution_execution_mode?: 'local' | 'modal' | null;
  job_character_discovery_method?: string | null;
  job_attribution_provider?: string | null;
  job_attribution_model?: string | null;
}

export const fetchQueue = () => apiRequest<QueueResponse>('/queue');
export const createJob = (req: JobCreateRequest) =>
  apiRequest<JobResponse>('/queue', { method: 'POST', body: JSON.stringify(req) });
export const startQueue = () =>
  apiRequest<{ status: string }>('/queue/start', { method: 'POST' });
export const pauseJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/pause`, { method: 'POST' });
export const resumeJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/resume`, { method: 'POST' });
export const retryJob = (id: string) =>
  apiRequest<JobResponse>(`/queue/${id}/retry`, { method: 'POST' });
// cancelJob: Sends DELETE to the queue endpoint, which kenkui interprets as
// "stop processing and remove this job". Valid for pending/processing/paused jobs.
// NOTE: kenkui's DELETE endpoint both cancels AND removes — there is no separate cancel HTTP verb.
// A running job that is DELETEd will be stopped and removed immediately.
export const cancelJob = (id: string) =>
  apiRequest<void>(`/queue/${id}`, { method: 'DELETE' });
// removeJob: Same HTTP call — kenkui removes terminal (completed/failed/cancelled) jobs.
export const removeJob = (id: string) =>
  apiRequest<void>(`/queue/${id}`, { method: 'DELETE' });
