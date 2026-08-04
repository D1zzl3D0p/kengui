import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import {
  UnsupportedProviderCredentialsError,
  deleteProviderCredentials,
  fetchProviderCredentials,
  testProviderCredentials,
  updateProviderCredentials,
} from './credentials';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({
    serverUrl: 'http://localhost:45365',
    serverMode: 'local',
    connectionStatus: 'connected',
  });
  mockFetch.mockReset();
});

describe('credentials api', () => {
  it('lists provider credential statuses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ providers: [] }),
    });

    await fetchProviderCredentials();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/provider-credentials',
      expect.any(Object)
    );
  });

  it('updates provider credentials without requiring an api key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          provider: 'openai',
          configured: true,
          default_model: 'gpt-4.1-mini',
          masked_key_hint: 'sk-t...1234',
        }),
    });

    await updateProviderCredentials('openai', { default_model: 'gpt-4.1-mini' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/provider-credentials/openai',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ default_model: 'gpt-4.1-mini' }),
      })
    );
  });

  it('deletes provider credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await deleteProviderCredentials('openrouter');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/provider-credentials/openrouter',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('tests provider credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok', message: 'Validated' }),
    });

    await testProviderCredentials('openai');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/provider-credentials/openai/test',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('raises a compatibility error when provider credentials routes are unsupported', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('not found'),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('not found'),
      });

    await expect(fetchProviderCredentials()).rejects.toBeInstanceOf(
      UnsupportedProviderCredentialsError
    );
  });
});
