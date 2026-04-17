import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { useConnectionStore } from '../store/connection';
import type { ServerMode } from '../store/connection';

export default function Settings() {
  const { serverMode, serverUrl, setServerMode } = useConnectionStore();
  const [localMode, setLocalMode] = useState<ServerMode>(serverMode);
  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    await setServerMode(localMode, localUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout>
      <div className="max-w-lg flex flex-col gap-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Server</h2>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="serverMode"
                value="local"
                aria-label="Local (managed)"
                checked={localMode === 'local'}
                onChange={() => setLocalMode('local')}
              />
              <div>
                <p className="font-medium text-sm">Local (managed)</p>
                <p className="text-xs text-muted-foreground">
                  kengui starts and manages kenkui automatically.
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="serverMode"
                value="external"
                aria-label="External server"
                checked={localMode === 'external'}
                onChange={() => setLocalMode('external')}
              />
              <div>
                <p className="font-medium text-sm">External server</p>
                <p className="text-xs text-muted-foreground">
                  Connect to a remote or manually-started kenkui server.
                </p>
              </div>
            </label>
          </div>

          {localMode === 'external' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="server-url">
                Server URL
              </label>
              <input
                id="server-url"
                type="url"
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="http://my-server.local:45365"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
              />
            </div>
          )}

          <Button className="w-fit" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save settings'}
          </Button>

          {localMode !== serverMode && (
            <p className="text-xs text-muted-foreground">
              Changes take effect after restarting kengui.
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
}
