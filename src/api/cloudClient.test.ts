import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudFunctionsUrl, cloudRequest, redactSignedUrls } from './cloudClient';
import { getAccessToken, refreshSupabaseSession } from '../auth/supabase';
import { useConnectionStore } from '../store/connection';

vi.mock('../auth/supabase', () => ({
  getAccessToken: vi.fn(),
  refreshSupabaseSession: vi.fn(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('VITE_KENKUI_CLOUD_FUNCTIONS_URL', '');
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    computeTarget: 'local',
    lastConnectedAt: null,
    connectionStatus: 'checking',
    connectionError: null,
  });
  globalThis.fetch = fetchMock;
  vi.mocked(getAccessToken).mockResolvedValue('token-1');
  vi.mocked(refreshSupabaseSession).mockResolvedValue(null);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe('redactSignedUrls', () => {
  it('redacts AWS signed URL query values from errors', () => {
    expect(
      redactSignedUrls(
        'failed https://r2.example/book?X-Amz-Credential=abc&X-Amz-Signature=secret'
      )
    ).toBe('failed [REDACTED_SIGNED_URL]');
  });
});

describe('cloud client', () => {
  it('defaults the functions URL to Supabase Edge Functions', () => {
    expect(cloudFunctionsUrl()).toBe('https://project.supabase.co/functions/v1');
  });

  it('uses the hosted server URL for hosted cloud connections', () => {
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'http://127.0.0.1:54321/functions/v1',
    });

    expect(cloudFunctionsUrl()).toBe('http://127.0.0.1:54321/functions/v1');
  });

  it('prefers an explicit functions URL over hosted server URL', () => {
    vi.stubEnv('VITE_KENKUI_CLOUD_FUNCTIONS_URL', 'http://127.0.0.1:9999/functions/v1');
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'http://127.0.0.1:54321',
    });

    expect(cloudFunctionsUrl()).toBe('http://127.0.0.1:9999/functions/v1');
  });

  it('uses the Supabase access token for cloud requests', async () => {
    await expect(cloudRequest('list-jobs')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/list-jobs',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const headers = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
    expect(headers.get('apikey')).toBe('anon-key');
  });

  it('refreshes the Supabase session once after a 401', async () => {
    vi.mocked(getAccessToken)
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('fresh-token');
    vi.mocked(refreshSupabaseSession).mockResolvedValue({
      email: 'reader@example.com',
      provider: 'google',
      expiresAt: 123,
    });
    fetchMock
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(cloudRequest('create-job')).resolves.toEqual({ ok: true });

    expect(refreshSupabaseSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchMock.mock.calls[1]![1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
  });
});
