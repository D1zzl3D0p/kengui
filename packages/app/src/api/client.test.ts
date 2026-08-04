import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConnectionStore } from '../store/connection';
import { apiRequest, ApiError } from './client';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  useConnectionStore.setState({
    serverUrl: 'http://localhost:45365',
    serverMode: 'local',
    connectionStatus: 'checking',
  });
  mockFetch.mockReset();
});

describe('apiRequest', () => {
  it('uses serverUrl from store', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    await apiRequest('/health');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:45365/v1/health',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('uses custom serverUrl when store has external URL', async () => {
    useConnectionStore.setState({
      serverUrl: 'http://remote:45365',
      serverMode: 'external',
      connectionStatus: 'connected',
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await apiRequest('/health');

    expect(mockFetch).toHaveBeenCalledWith('http://remote:45365/v1/health', expect.any(Object));
  });

  it('falls back to unversioned route when v1 route is not found', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('not found'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

    await apiRequest('/health');

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:45365/v1/health',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:45365/health',
      expect.any(Object)
    );
  });

  it('throws ApiError on non-ok response', async () => {
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

    await expect(apiRequest('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('ApiError carries status code', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });

    try {
      await apiRequest('/broken');
    } catch (e) {
      expect((e as ApiError).status).toBe(500);
    }
  });
});
