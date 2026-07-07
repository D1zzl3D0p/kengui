import { apiRequest } from './client';
import type { Schemas } from './schemas';

export type KenkuiConfig = Record<string, unknown>;

export type ConfigResponse = Schemas['ConfigResponse'];

export type OkResponse = Schemas['OkResponse'];

export const fetchConfig = () => apiRequest<ConfigResponse>('/config');

export const replaceConfig = (config: KenkuiConfig) =>
  apiRequest<OkResponse>('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });

export const patchConfig = (config: KenkuiConfig) =>
  apiRequest<ConfigResponse>('/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });

export const updateConfig = patchConfig;
