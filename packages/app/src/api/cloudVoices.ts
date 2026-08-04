import { cloudRequest } from './cloudClient';
import type {
  SuggestCastInput,
  SuggestCastResponse,
  VoiceListResponse,
  VoicePreviewAsset,
} from './voices';

function assertSecurePreviewUrl(preview: VoicePreviewAsset): void {
  let parsed: URL;
  try {
    parsed = new URL(preview.audio_url);
  } catch {
    throw new Error(`Voice preview ${preview.phrase_id} must use a secure HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Voice preview ${preview.phrase_id} must use a secure HTTPS URL.`);
  }
}

function validateCloudVoiceList(response: VoiceListResponse): VoiceListResponse {
  if (!Array.isArray(response.voices)) {
    throw new Error('Hosted voice catalog is missing its voices array.');
  }
  if (!Array.isArray(response.phrase_catalog)) {
    throw new Error('Hosted voice catalog is missing its phrase catalog.');
  }
  for (const voice of response.voices) {
    if (!Array.isArray(voice.previews)) {
      throw new Error(`Hosted voice ${voice.name} is missing preview metadata.`);
    }
    voice.previews.forEach(assertSecurePreviewUrl);
  }
  return response;
}

export async function fetchCloudVoices(): Promise<VoiceListResponse> {
  const response = await cloudRequest<VoiceListResponse>('list-voices');
  return validateCloudVoiceList(response);
}

export function suggestCloudCast(input: SuggestCastInput): Promise<SuggestCastResponse> {
  return cloudRequest<SuggestCastResponse>('suggest-cast', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
