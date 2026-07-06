import { apiRequest } from './client';
import { useConnectionStore } from '../store/connection';
import { resolveServerBaseUrl } from './serverUrl';
import type { AnalysisCharacter } from './books';
import type { TaskResponse } from './tasks';
import type { Schemas } from './schemas';

export type VoiceResponse = Schemas['VoiceResponse'];

export type VoiceListResponse = Schemas['VoiceListResponse'];

export type VoicePoolResponse = Schemas['VoicePoolResponse'];

export type SuggestCastResponse = Schemas['SuggestCastResponse'];

export type AuditionRequest = Schemas['AuditionRequest'];

// `force` has a server-side default, so it is optional for callers.
export type DownloadRequest = Partial<Schemas['DownloadRequest']>;

// Client-side: no server schema (audition task result shape).
export interface AudioPreviewResult {
  voice_id: string;
  audio_path: string;
  duration_ms?: number | null;
}

export const fetchVoices = () => apiRequest<VoiceListResponse>('/voices');

export const excludeVoice = (name: string) =>
  apiRequest<VoicePoolResponse>(`/voices/${encodeURIComponent(name)}/exclude`, {
    method: 'POST',
  });

export const includeVoice = (name: string) =>
  apiRequest<VoicePoolResponse>(`/voices/${encodeURIComponent(name)}/exclude`, {
    method: 'DELETE',
  });

export const suggestCast = (
  roster: AnalysisCharacter[],
  excluded_voices: string[] = [],
  default_voice = 'alba'
) =>
  apiRequest<SuggestCastResponse>('/voices/suggest-cast', {
    method: 'POST',
    body: JSON.stringify({
      roster: roster.map((character) => ({
        name: character.character_id,
        pronoun: character.gender_pronoun,
        quote_count: character.quote_count,
        mention_count: character.mention_count,
      })),
      excluded_voices,
      default_voice,
    }),
  });

export const auditionVoice = (request: AuditionRequest) =>
  apiRequest<TaskResponse<AudioPreviewResult>>('/voices/audition', {
    method: 'POST',
    body: JSON.stringify(request),
  });

export const downloadCompiledVoices = (request: DownloadRequest = {}) =>
  apiRequest<TaskResponse>('/voices/download/compiled', {
    method: 'POST',
    body: JSON.stringify({ force: Boolean(request.force) }),
  });

export function auditionAudioUrl(taskId: string): string {
  const { serverMode, serverUrl } = useConnectionStore.getState();
  const baseUrl = resolveServerBaseUrl(serverUrl, serverMode);
  return `${baseUrl}/v1/voices/audition/${taskId}.wav`;
}
