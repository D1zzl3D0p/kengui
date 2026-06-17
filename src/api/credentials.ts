import { apiRequest } from './client';

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

export const fetchProviderCredentials = () =>
  apiRequest<ProviderCredentialListResponse>('/provider-credentials');

export const updateProviderCredentials = (
  provider: string,
  request: ProviderCredentialUpdateRequest
) =>
  apiRequest<ProviderCredentialStatus>(`/provider-credentials/${provider}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  });

export const deleteProviderCredentials = (provider: string) =>
  apiRequest<void>(`/provider-credentials/${provider}`, { method: 'DELETE' });
