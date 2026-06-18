import { apiRequest } from './client';

export interface SeriesCharacter {
  canonical: string;
  aliases: string[];
  gender: string;
  voice: string;
}

export interface SeriesModel {
  slug: string;
  name: string;
  updated_at?: string;
  characters?: SeriesCharacter[];
}

export interface SeriesListResponse {
  series: SeriesModel[];
  total: number;
}

export interface SeriesMatchRequest {
  fast_result: Record<string, unknown>;
}

export interface SeriesMatchResponse {
  inherited_voices: Record<string, string>;
  pinned: string[];
}

export const fetchSeries = () =>
  apiRequest<SeriesListResponse>('/series');

export const fetchSeriesDetail = (slug: string) =>
  apiRequest<SeriesModel>(`/series/${encodeURIComponent(slug)}`);

export const matchSeries = (slug: string, request: SeriesMatchRequest) =>
  apiRequest<SeriesMatchResponse>(`/series/${encodeURIComponent(slug)}/match`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
