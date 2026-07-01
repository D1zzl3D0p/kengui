import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCloudConnection } from '../api/cloudClient';
import { useConnectionStore } from '../store/connection';
import { connectCurrentRuntime } from './connectRuntime';

vi.mock('../api/cloudClient', () => ({
  validateCloudConnection: vi.fn(),
}));

describe('connectCurrentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      serverMode: 'hosted',
      serverUrl: 'http://127.0.0.1:54321',
      authMode: 'supabase',
      computeTarget: 'kenkui-cloud',
      lastConnectedAt: null,
      connectionStatus: 'checking',
      connectionError: null,
    });
    vi.mocked(validateCloudConnection).mockResolvedValue(undefined);
  });

  it('validates hosted mode through the cloud control plane', async () => {
    await connectCurrentRuntime();

    expect(validateCloudConnection).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState()).toMatchObject({
      connectionStatus: 'connected',
      serverMode: 'hosted',
      computeTarget: 'kenkui-cloud',
    });
  });
});
