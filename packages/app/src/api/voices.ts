import { apiRequest } from './client';
import { useConnectionStore } from '../store/connection';
import { resolveServerBaseUrl } from './serverUrl';
import type { AnalysisCharacter } from './books';
import type { TaskResponse } from './tasks';
import type { Schemas } from './schemas';
import { fetchCloudVoices, suggestCloudCast } from './cloudVoices';

export interface VoicePreviewPhrase {
  phrase_id: string;
  title: string;
  author: string;
  text: string;
  source_url: string;
}

export interface VoicePreviewAsset {
  phrase_id: string;
  audio_url: string;
  content_type: string;
  duration_ms: number;
  sha256: string;
}

export type VoiceResponse = Schemas['VoiceResponse'] & {
  previews?: VoicePreviewAsset[];
};

export type VoiceListResponse = Omit<Schemas['VoiceListResponse'], 'voices'> & {
  voices: VoiceResponse[];
  phrase_catalog?: VoicePreviewPhrase[];
  default_phrase_id?: string;
};

export type VoicePoolResponse = Schemas['VoicePoolResponse'];

export type SuggestCastResponse = Schemas['SuggestCastResponse'];

export type AuditionRequest = Schemas['AuditionRequest'];

export interface SuggestCastCharacter {
  name: string;
  pronoun: string | null;
  quote_count: number;
  mention_count: number;
}

export interface SuggestCastInput {
  roster: SuggestCastCharacter[];
  excluded_voices: string[];
  default_voice: string;
}

// `force` has a server-side default, so it is optional for callers.
export type DownloadRequest = Partial<Schemas['DownloadRequest']>;

// Client-side: no server schema (audition task result shape).
export interface AudioPreviewResult {
  voice_id: string;
  audio_path: string;
  duration_ms?: number | null;
}

export const fetchVoices = () =>
  useConnectionStore.getState().serverMode === 'hosted'
    ? fetchCloudVoices()
    : apiRequest<VoiceListResponse>('/voices');

export const excludeVoice = (name: string) =>
  apiRequest<VoicePoolResponse>(`/voices/${encodeURIComponent(name)}/exclude`, {
    method: 'POST',
  });

export const includeVoice = (name: string) =>
  apiRequest<VoicePoolResponse>(`/voices/${encodeURIComponent(name)}/exclude`, {
    method: 'DELETE',
  });

export function buildSuggestCastInput(
  roster: AnalysisCharacter[],
  excluded_voices: string[] = [],
  default_voice = 'alba'
): SuggestCastInput {
  return {
    roster: roster.map((character) => ({
      name: character.character_id,
      pronoun: character.gender_pronoun,
      quote_count: character.quote_count,
      mention_count: character.mention_count,
    })),
    excluded_voices,
    default_voice,
  };
}

export const suggestCast = (
  roster: AnalysisCharacter[],
  excluded_voices: string[] = [],
  default_voice = 'alba'
) => {
  const input = buildSuggestCastInput(roster, excluded_voices, default_voice);
  if (useConnectionStore.getState().serverMode === 'hosted') {
    return suggestCloudCast(input);
  }
  return apiRequest<SuggestCastResponse>('/voices/suggest-cast', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

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
