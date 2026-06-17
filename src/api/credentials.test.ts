import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
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
});
