import { ApiError, apiRequest } from './client';

export interface ProviderCredentialStatus {
  provider: string;
  configured: boolean;
  default_model: string;
  masked_key_hint: string;
}

export interface ProviderCredentialListResponse {
  providers: ProviderCredentialStatus[];
}

export interface ProviderCredentialUpdateRequest {
  api_key?: string | null;
  default_model?: string | null;
}

export interface ProviderCredentialTestResponse {
  status?: string;
  message?: string;
}

export class UnsupportedProviderCredentialsError extends Error {
  constructor() {
    super('This kenkui runtime does not support provider credentials management. Upgrade kenkui and try again.');
    this.name = 'UnsupportedProviderCredentialsError';
  }
}

export function isProviderCredentialsUnsupportedError(
  error: unknown
): error is UnsupportedProviderCredentialsError {
  return error instanceof UnsupportedProviderCredentialsError;
}

async function providerCredentialRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new UnsupportedProviderCredentialsError();
    }
    throw error;
  }
}

export const fetchProviderCredentials = () =>
  providerCredentialRequest<ProviderCredentialListResponse>('/provider-credentials');

export const updateProviderCredentials = (
  provider: string,
  request: ProviderCredentialUpdateRequest
) =>
  providerCredentialRequest<ProviderCredentialStatus>(
    `/provider-credentials/${encodeURIComponent(provider)}`,
    {
    method: 'PUT',
    body: JSON.stringify(request),
    }
  );

export const deleteProviderCredentials = (provider: string) =>
  providerCredentialRequest<void>(`/provider-credentials/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });

export const testProviderCredentials = (provider: string) =>
  providerCredentialRequest<ProviderCredentialTestResponse>(
    `/provider-credentials/${encodeURIComponent(provider)}/test`,
    { method: 'POST' }
  );
