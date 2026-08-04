import { useEffect, useState } from 'react';
import { useConnectionStore } from '../store/connection';
import { fetchProviderModels } from '../api/providerModels';

function sortModels(models: readonly string[]): string[] {
  return [...models].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function useProviderModels(provider: string) {
  const { serverMode, serverUrl } = useConnectionStore();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const selectedProvider = provider.trim();
    if (!selectedProvider) {
      setModels([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setModels([]);

    fetchProviderModels(selectedProvider)
      .then((response) => {
        if (cancelled) return;
        setModels(sortModels(response.models ?? []));
      })
      .catch((nextError) => {
        if (cancelled) return;
        setModels([]);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load models.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider, serverMode, serverUrl]);

  return { models, loading, error };
}
