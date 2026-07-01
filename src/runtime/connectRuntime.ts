import { useConnectionStore } from '../store/connection';
import { validateCloudConnection } from '../api/cloudClient';
import {
  createRuntimeAdapter,
  RuntimeCompatibilityError,
  waitForRuntimeHealth,
} from './runtime';

export async function connectCurrentRuntime(): Promise<void> {
  const {
    serverMode,
    serverUrl,
    setConnectionStatus,
    setConnectionError,
    markConnected,
  } = useConnectionStore.getState();
  const runtime = createRuntimeAdapter(serverMode, serverUrl);

  setConnectionStatus('checking');
  setConnectionError(null);

  if (serverMode === 'hosted') {
    await validateCloudConnection();
    setConnectionStatus('connected');
    await markConnected();
    return;
  }

  if (serverMode === 'local') {
    try {
      await runtime.health();
      setConnectionStatus('connected');
      await markConnected();
      return;
    } catch (healthError) {
      if (healthError instanceof RuntimeCompatibilityError) {
        setConnectionError(healthError.message);
        setConnectionStatus('error');
        throw healthError;
      }
    }

    const found = await runtime.checkAvailable();
    if (!found) {
      setConnectionStatus('not_found');
      throw new Error('Kengui could not find a usable local kenkui runtime.');
    }

    await runtime.start();
    await waitForRuntimeHealth(runtime);
    setConnectionStatus('connected');
    await markConnected();
    return;
  }

  await runtime.health();
  setConnectionStatus('connected');
  await markConnected();
}
