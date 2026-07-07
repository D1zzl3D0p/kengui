import { apiRequest } from './client';
import type { Schemas } from './schemas';

export type SeriesCharacter = Schemas['SeriesCharacterModel'];

export type SeriesModel = Schemas['SeriesModel'];

export type SeriesListResponse = Schemas['SeriesListResponse'];

export type CreateEmptySeriesRequest = Schemas['CreateEmptySeriesRequest'];

export type SeriesMatchRequest = Schemas['SeriesMatchRequest'];

export type SeriesMatchResponse = Schemas['SeriesMatchResponse'];

export const fetchSeries = () =>
  apiRequest<SeriesListResponse>('/series');

export const createEmptySeries = (name: string) =>
  apiRequest<SeriesModel>('/series/empty', {
    method: 'POST',
    body: JSON.stringify({ name } satisfies CreateEmptySeriesRequest),
  });

export const fetchSeriesDetail = (slug: string) =>
  apiRequest<SeriesModel>(`/series/${encodeURIComponent(slug)}`);

export const matchSeries = (slug: string, request: SeriesMatchRequest) =>
  apiRequest<SeriesMatchResponse>(`/series/${encodeURIComponent(slug)}/match`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
