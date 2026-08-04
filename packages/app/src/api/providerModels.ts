import { ApiError, apiRequest } from './client';
import type { Schemas } from './schemas';

export type ProviderModelListResponse = Schemas['ProviderModelListResponse'];

export class UnsupportedProviderModelsError extends Error {
  constructor() {
    super('This kenkui runtime does not support provider model discovery. Upgrade kenkui and try again.');
    this.name = 'UnsupportedProviderModelsError';
  }
}

export function isProviderModelsUnsupportedError(error: unknown): error is UnsupportedProviderModelsError {
  return error instanceof UnsupportedProviderModelsError;
}

export async function fetchProviderModels(provider: string): Promise<ProviderModelListResponse> {
  try {
    return await apiRequest<ProviderModelListResponse>(
      `/provider-models/${encodeURIComponent(provider)}`
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new UnsupportedProviderModelsError();
    }
    throw error;
  }
}
