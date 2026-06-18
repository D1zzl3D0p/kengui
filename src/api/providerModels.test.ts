import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import {
  UnsupportedProviderModelsError,
  fetchProviderModels,
} from './providerModels';

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

describe('provider models api', () => {
  it('lists provider-scoped model options', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ provider: 'openai', models: ['gpt-4o'] }),
    });

    await fetchProviderModels('openai');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/provider-models/openai',
      expect.any(Object)
    );
  });

  it('raises a compatibility error when model discovery is unsupported', async () => {
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

    await expect(fetchProviderModels('openai')).rejects.toBeInstanceOf(
      UnsupportedProviderModelsError
    );
  });
});
