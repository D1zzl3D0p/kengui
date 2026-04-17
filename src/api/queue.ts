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
  speaker_voices: Record<string, string>;
  chapter_voices: Record<string, string>;
}

export const fetchQueue = () => apiRequest<QueueResponse>('/queue');
export const createJob = (req: JobCreateRequest) =>
  apiRequest<JobResponse>('/queue', { method: 'POST', body: JSON.stringify(req) });
export const pauseJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/pause`, { method: 'POST' });
export const resumeJob = (id: string) =>
  apiRequest<void>(`/queue/${id}/resume`, { method: 'POST' });
export const cancelJob = (id: string) =>
  apiRequest<void>(`/queue/${id}`, { method: 'DELETE' });
