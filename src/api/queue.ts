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
  voice: string;
  chapter_selection: ChapterSelection | null;
  narration_mode: NarrationMode;
  name: string | null;
  output_path: string | null;
  tts_execution_mode: 'local' | 'modal';
  speaker_voices: Record<string, string>;
  chapter_voices: Record<string, string>;
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
export const cancelJob = (id: string) =>
  apiRequest<void>(`/queue/${id}`, { method: 'DELETE' });
