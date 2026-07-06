import { useState } from 'react';
import { Layout } from '../../components/Layout';
import { useConnectionStore } from '../../store/connection';
import type { ComputeTarget, ServerMode } from '../../store/connection';
import { useDiagnostics } from '../../hooks/useDiagnostics';
import { ConnectionSettings } from './ConnectionSettings';
import { AccountSettings } from './AccountSettings';
import { ConfigSettings } from './ConfigSettings';
import { CredentialSettings } from './CredentialSettings';
import { CLOUD_COMPUTE_ENABLED } from './constants';

export default function Settings() {
  const { serverMode, serverUrl, computeTarget } = useConnectionStore();
  const [localMode, setLocalMode] = useState<ServerMode>(serverMode);
  const [localUrl, setLocalUrl] = useState(serverUrl);
  const [localComputeTarget, setLocalComputeTarget] = useState<ComputeTarget>(computeTarget);
  const [workers, setWorkers] = useState('');
  const diagnostics = useDiagnostics();

  const showCloudAccount =
    CLOUD_COMPUTE_ENABLED || computeTarget === 'kenkui-cloud' || localComputeTarget === 'kenkui-cloud';

  return (
    <Layout>
      <div className="max-w-3xl flex flex-col gap-8">
        <div>
          <p className="text-sm font-medium text-primary">Settings</p>
          <h1 className="text-3xl font-semibold">Runtime Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose where conversions run and inspect the current kenkui connection.
          </p>
        </div>

        <ConnectionSettings
          localMode={localMode}
          setLocalMode={setLocalMode}
          localUrl={localUrl}
          setLocalUrl={setLocalUrl}
          localComputeTarget={localComputeTarget}
          setLocalComputeTarget={setLocalComputeTarget}
          workers={workers}
          diagnostics={diagnostics}
        />

        {showCloudAccount && <AccountSettings localComputeTarget={localComputeTarget} />}

        <ConfigSettings health={diagnostics.health} onWorkersChange={setWorkers} />

        <CredentialSettings health={diagnostics.health} />
      </div>
    </Layout>
  );
}
