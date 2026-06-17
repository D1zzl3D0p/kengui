import { apiRequest } from './client';

export type KenkuiConfig = Record<string, unknown>;

export interface ConfigResponse {
  config: KenkuiConfig;
}

export interface OkResponse {
  message?: string;
  status?: string;
}

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
