import { apiRequest } from './client';

export interface VoiceResponse {
  name: string;
  source: string;
  gender: string | null;
  accent: string | null;
  dataset: string | null;
  speaker_id: string | null;
  description: string;
  display_label: string;
  excluded: boolean;
}

export interface VoiceListResponse {
  voices: VoiceResponse[];
  total: number;
}

export const fetchVoices = () => apiRequest<VoiceListResponse>('/voices');
