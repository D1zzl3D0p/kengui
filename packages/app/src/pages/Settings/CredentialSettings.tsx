import { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ModelCombobox } from '../../components/ModelCombobox';
import {
  deleteProviderCredentials,
  fetchProviderCredentials,
  isProviderCredentialsUnsupportedError,
  testProviderCredentials,
  updateProviderCredentials,
  type ProviderCredentialStatus,
} from '../../api/credentials';
import { CREDENTIAL_PROVIDER_OPTIONS, providerLabel } from '../../lib/providerCatalog';
import { useProviderModels } from '../../hooks/useProviderModels';
import { supportsProviderCredentials, type RuntimeHealth } from '../../runtime/runtime';
import { useConnectionStore } from '../../store/connection';

type CredentialDraft = {
  apiKey: string;
  defaultModel: string;
};

interface Props {
  health: RuntimeHealth | null;
}

export function CredentialSettings({ health }: Props) {
  const { serverMode, serverUrl } = useConnectionStore();
  const [credentials, setCredentials] = useState<ProviderCredentialStatus[]>([]);
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, CredentialDraft>>({});
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [selectedCredentialProvider, setSelectedCredentialProvider] = useState<string>(
    CREDENTIAL_PROVIDER_OPTIONS[0].value
  );
  const {
    models: credentialModelOptions,
    loading: credentialModelsLoading,
    error: credentialModelsError,
  } = useProviderModels(selectedCredentialProvider);

  const providerCredentialsSupported = supportsProviderCredentials(health);
  const selectedCredentialStatus = useMemo(
    () =>
      credentials.find((item) => item.provider === selectedCredentialProvider) ?? {
        provider: selectedCredentialProvider,
        configured: false,
        default_model: '',
        masked_key_hint: '',
      },
    [credentials, selectedCredentialProvider]
  );
  const selectedCredentialDraft =
    credentialDrafts[selectedCredentialProvider] ?? {
      apiKey: '',
      defaultModel: selectedCredentialStatus.default_model,
    };

  useEffect(() => {
    if (serverMode === 'hosted') {
      setCredentials([]);
      return;
    }
    refreshCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, serverUrl]);

  async function refreshCredentials() {
    setCredentialLoading(true);
    setCredentialError(null);
    try {
      const response = await fetchProviderCredentials();
      setCredentials(response.providers);
      setCredentialDrafts((current) => {
        const nextDrafts = { ...current };
        const statusesByProvider = new Map(
          response.providers.map((status) => [status.provider, status] as const)
        );

        for (const provider of CREDENTIAL_PROVIDER_OPTIONS) {
          const status = statusesByProvider.get(provider.value);
          if (status) {
            nextDrafts[provider.value] = {
              apiKey: '',
              defaultModel:
                nextDrafts[provider.value]?.defaultModel.trim() || status.default_model,
            };
            continue;
          }
          if (!nextDrafts[provider.value]) {
            nextDrafts[provider.value] = { apiKey: '', defaultModel: '' };
          }
        }

        return nextDrafts;
      });
    } catch (error) {
      setCredentials([]);
      if (isProviderCredentialsUnsupportedError(error)) {
        setCredentialError(error.message);
      } else {
        setCredentialError(error instanceof Error ? error.message : 'Credential load failed.');
      }
    } finally {
      setCredentialLoading(false);
    }
  }

  function updateCredentialDraft(provider: string, patch: Partial<CredentialDraft>) {
    setCredentialDrafts((current) => ({
      ...current,
      [provider]: {
        apiKey: '',
        defaultModel: '',
        ...current[provider],
        ...patch,
      },
    }));
  }

  async function saveCredential(provider: string) {
    const draft = credentialDrafts[provider] ?? { apiKey: '', defaultModel: '' };
    const currentStatus = credentials.find((item) => item.provider === provider);
    const needsKey = !currentStatus?.configured && !draft.apiKey.trim();
    const resolvedDefaultModel = draft.defaultModel.trim() || currentStatus?.default_model || '';

    if (needsKey) {
      setCredentialError('API key is required to add this provider.');
      return;
    }
    if (!resolvedDefaultModel) {
      setCredentialError('Select a default model.');
      return;
    }

    setCredentialSaving(provider);
    setCredentialError(null);
    setCredentialMessage(null);
    try {
      const request = {
        default_model: resolvedDefaultModel,
      } as { api_key?: string | null; default_model?: string | null };
      if (draft.apiKey.trim()) {
        request.api_key = draft.apiKey.trim();
      }
      const updated = await updateProviderCredentials(provider, request);
      setCredentials((current) => {
        const exists = current.some((item) => item.provider === provider);
        if (!exists) {
          return [...current, updated];
        }
        return current.map((item) => (item.provider === provider ? updated : item));
      });
      updateCredentialDraft(provider, {
        apiKey: '',
        defaultModel: updated.default_model,
      });
      setCredentialMessage(`${providerLabel(provider)} saved.`);

      try {
        await testProviderCredentials(provider);
        setCredentialMessage(`${providerLabel(provider)} saved and validated.`);
      } catch (error) {
        setCredentialError(
          error instanceof Error
            ? `${providerLabel(provider)} saved, but validation failed: ${error.message}`
            : `${providerLabel(provider)} saved, but validation failed.`
        );
      }

      setTimeout(() => setCredentialMessage(null), 1800);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Credential save failed.');
    } finally {
      setCredentialSaving(null);
    }
  }

  async function deleteCredential(provider: string) {
    setCredentialSaving(provider);
    setCredentialError(null);
    setCredentialMessage(null);
    try {
      await deleteProviderCredentials(provider);
      setCredentialDrafts((current) => ({
        ...current,
        [provider]: { apiKey: '', defaultModel: '' },
      }));
      await refreshCredentials();
      setCredentialMessage(`${providerLabel(provider)} removed.`);
      setTimeout(() => setCredentialMessage(null), 1800);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Credential delete failed.');
    } finally {
      setCredentialSaving(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold">Provider Credentials</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshCredentials}
          disabled={credentialLoading}
        >
          <RefreshCw aria-hidden="true" />
          {credentialLoading ? 'Loading...' : 'Reload'}
        </Button>
      </div>

      {!providerCredentialsSupported && health ? (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This runtime does not support provider credentials management. Upgrade kenkui to edit or validate credentials here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-2">
            {CREDENTIAL_PROVIDER_OPTIONS.map((provider) => {
              const credential = credentials.find((item) => item.provider === provider.value) ?? {
                provider: provider.value,
                configured: false,
                default_model: '',
                masked_key_hint: '',
              };
              const active = selectedCredentialProvider === provider.value;

              return (
                <div
                  key={provider.value}
                  className={`flex items-start justify-between gap-3 rounded-md border px-3 py-3 ${
                    active ? 'border-primary/50 bg-primary/5' : 'bg-background/45'
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="font-medium">{provider.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      {credential.configured
                        ? `Configured ${credential.masked_key_hint}`
                        : 'Not configured'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {credential.default_model
                        ? `Default model ${credential.default_model}`
                        : 'No default model'}
                    </p>
                  </div>
                  <Button
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectedCredentialProvider(provider.value);
                      setCredentialError(null);
                      setCredentialMessage(null);
                    }}
                  >
                    {active ? 'Selected' : 'Edit'}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border bg-background/45 p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-medium">{providerLabel(selectedCredentialProvider)}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedCredentialStatus.configured
                    ? `Configured ${selectedCredentialStatus.masked_key_hint}`
                    : 'Not configured'}
                </p>
                {selectedCredentialStatus.default_model && (
                  <p className="text-xs text-muted-foreground">
                    Current model {selectedCredentialStatus.default_model}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => saveCredential(selectedCredentialProvider)}
                  disabled={
                    credentialSaving === selectedCredentialProvider ||
                    credentialLoading ||
                    credentialModelsLoading ||
                    !selectedCredentialDraft.defaultModel.trim() ||
                    (!selectedCredentialStatus.configured && !selectedCredentialDraft.apiKey.trim())
                  }
                >
                  <Save aria-hidden="true" />
                  {credentialSaving === selectedCredentialProvider
                    ? 'Saving...'
                    : 'Save and test'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteCredential(selectedCredentialProvider)}
                  disabled={
                    credentialSaving === selectedCredentialProvider ||
                    credentialLoading ||
                    !selectedCredentialStatus.configured
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Provider</span>
                <select
                  className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                  value={selectedCredentialProvider}
                  onChange={(event) => {
                    setSelectedCredentialProvider(event.target.value);
                    setCredentialError(null);
                    setCredentialMessage(null);
                  }}
                >
                  {CREDENTIAL_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  className="box-border min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2"
                  placeholder={
                    selectedCredentialStatus.configured
                      ? 'Leave blank to keep existing key'
                      : 'Enter API key'
                  }
                  value={selectedCredentialDraft.apiKey}
                  onChange={(event) =>
                    updateCredentialDraft(selectedCredentialProvider, {
                      apiKey: event.target.value,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Default model</span>
                {credentialModelsLoading && (
                  <p className="text-xs text-muted-foreground">Loading models...</p>
                )}
                {!credentialModelsLoading && credentialModelsError && (
                  <p className="text-xs text-destructive">{credentialModelsError}</p>
                )}
                <ModelCombobox
                  id="credential-default-model"
                  value={selectedCredentialDraft.defaultModel}
                  onChange={(value) =>
                    updateCredentialDraft(selectedCredentialProvider, {
                      defaultModel: value,
                    })
                  }
                  options={credentialModelOptions}
                  placeholder="Search models"
                  disabled={credentialModelsLoading}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {credentialMessage && (
        <p className="rounded-md border border-[var(--color-success)]/25 bg-[rgb(111_138_101_/_12%)] px-3 py-2 text-sm text-[var(--color-success)]">
          {credentialMessage}
        </p>
      )}
      {credentialError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {credentialError}
        </p>
      )}
    </section>
  );
}
