import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ModelCombobox } from '../../components/ModelCombobox';
import { fetchConfig, patchConfig, type KenkuiConfig } from '../../api/config';
import { fetchVoices, type VoiceResponse } from '../../api/voices';
import { M4B_BITRATE_OPTIONS, NLP_PROVIDER_OPTIONS } from '../../lib/providerCatalog';
import { withCurrentOption } from '../../lib/selectOptions';
import { useProviderModels } from '../../hooks/useProviderModels';
import { supportsProviderModels, type RuntimeHealth } from '../../runtime/runtime';
import { useConnectionStore } from '../../store/connection';
import { shouldWarnHighWorkers } from './workerWarning';

type ConfigForm = {
  default_voice: string;
  default_output_dir: string;
  workers: string;
  m4b_bitrate: string;
  pause_line_ms: string;
  pause_chapter_ms: string;
  nlp_provider: string;
  nlp_model: string;
  ollama_url: string;
  nlp_discovery_method: string;
};

const EMPTY_CONFIG_FORM: ConfigForm = {
  default_voice: '',
  default_output_dir: '',
  workers: '',
  m4b_bitrate: '',
  pause_line_ms: '',
  pause_chapter_ms: '',
  nlp_provider: '',
  nlp_model: '',
  ollama_url: '',
  nlp_discovery_method: '',
};

function configString(config: KenkuiConfig, key: keyof ConfigForm): string {
  const value = config[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function hydrateConfigForm(config: KenkuiConfig): ConfigForm {
  return {
    default_voice: configString(config, 'default_voice'),
    default_output_dir: configString(config, 'default_output_dir'),
    workers: configString(config, 'workers'),
    m4b_bitrate: configString(config, 'm4b_bitrate'),
    pause_line_ms: configString(config, 'pause_line_ms'),
    pause_chapter_ms: configString(config, 'pause_chapter_ms'),
    nlp_provider: configString(config, 'nlp_provider'),
    nlp_model: configString(config, 'nlp_model'),
    ollama_url: configString(config, 'ollama_url'),
    nlp_discovery_method: configString(config, 'nlp_discovery_method'),
  };
}

function parseBoundedInt(value: string, label: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return parsed;
}

function configPatchFromForm(form: ConfigForm): KenkuiConfig {
  return {
    default_voice: form.default_voice.trim(),
    default_output_dir: form.default_output_dir.trim() || null,
    workers: parseBoundedInt(form.workers, 'Workers', 1, 128),
    m4b_bitrate: form.m4b_bitrate.trim(),
    pause_line_ms: parseBoundedInt(form.pause_line_ms, 'Line pause', 0, 30000),
    pause_chapter_ms: parseBoundedInt(form.pause_chapter_ms, 'Chapter pause', 0, 120000),
    nlp_provider: form.nlp_provider.trim(),
    nlp_model: form.nlp_model.trim(),
    ollama_url: form.ollama_url.trim(),
    nlp_discovery_method: form.nlp_discovery_method.trim() || 'auto',
  };
}

interface Props {
  health: RuntimeHealth | null;
  /** Reports the current workers value up for the runtime diagnostics table. */
  onWorkersChange: (workers: string) => void;
}

export function ConfigSettings({ health, onWorkersChange }: Props) {
  const { serverMode, serverUrl } = useConnectionStore();
  const [configForm, setConfigForm] = useState<ConfigForm>(EMPTY_CONFIG_FORM);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceResponse[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const {
    models: configModelOptions,
    loading: configModelsLoading,
    error: configModelsError,
  } = useProviderModels(configForm.nlp_provider);

  const availableVoices = useMemo(() => voices.filter((voice) => !voice.excluded), [voices]);
  const configuredWorkers = Number(configForm.workers || 0);
  const showHighWorkerWarning = shouldWarnHighWorkers(serverMode, configuredWorkers);
  const providerModelsSupported = supportsProviderModels(health);
  const providerModelsUnavailable =
    Boolean(health && !providerModelsSupported) ||
    Boolean(configModelsError?.includes('does not support provider model discovery'));

  // Report workers synchronously with each form change so the runtime
  // diagnostics table (rendered by ConnectionSettings) stays in lockstep.
  function applyConfigForm(form: ConfigForm) {
    setConfigForm(form);
    onWorkersChange(form.workers);
  }

  useEffect(() => {
    if (serverMode === 'hosted') {
      applyConfigForm(EMPTY_CONFIG_FORM);
      setVoices([]);
      return;
    }
    refreshConfig();
    refreshVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, serverUrl]);

  async function refreshConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetchConfig();
      applyConfigForm(hydrateConfigForm(response.config));
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Config load failed.');
    } finally {
      setConfigLoading(false);
    }
  }

  async function refreshVoices() {
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      const response = await fetchVoices();
      setVoices(response.voices);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Voice load failed.');
    } finally {
      setVoiceLoading(false);
    }
  }

  async function saveConfig() {
    if (!configForm.nlp_model.trim()) {
      setConfigError('Select an NLP model.');
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    setConfigMessage(null);
    try {
      const response = await patchConfig(configPatchFromForm(configForm));
      applyConfigForm(hydrateConfigForm(response.config));
      setConfigMessage('Config saved.');
      setTimeout(() => setConfigMessage(null), 1800);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Config save failed.');
    } finally {
      setConfigSaving(false);
    }
  }

  function updateConfigField(field: keyof ConfigForm, value: string) {
    setConfigForm((current) => ({ ...current, [field]: value }));
    if (field === 'workers') onWorkersChange(value);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-muted text-primary">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold">Config</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshConfig} disabled={configLoading}>
            <RefreshCw aria-hidden="true" />
            {configLoading ? 'Loading...' : 'Reload'}
          </Button>
          <Button
            size="sm"
            onClick={saveConfig}
            disabled={configSaving || configLoading || configModelsLoading || !configForm.nlp_model.trim()}
          >
            <Save aria-hidden="true" />
            {configSaving ? 'Saving...' : 'Save config'}
          </Button>
        </div>
      </div>

      {showHighWorkerWarning && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Workers is set to {configuredWorkers}. Higher worker counts use more memory; if synthesis fails with worker or pipe errors, restart the local runtime and retry with a lower worker count.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Default voice</span>
          {voiceLoading && <p className="text-xs text-muted-foreground">Loading voices...</p>}
          {!voiceLoading && voiceError && (
            <p className="text-xs text-destructive">{voiceError}</p>
          )}
          <select
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.default_voice}
            onChange={(event) => updateConfigField('default_voice', event.target.value)}
            disabled={voiceLoading}
          >
            <option value="">Select a voice</option>
            {configForm.default_voice.trim() &&
              !availableVoices.some((voice) => voice.name === configForm.default_voice) && (
                <option value={configForm.default_voice}>
                  Current: {configForm.default_voice}
                </option>
              )}
            {availableVoices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.display_label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Default output dir</span>
          <input
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.default_output_dir}
            onChange={(event) => updateConfigField('default_output_dir', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Workers</span>
          <input
            type="number"
            min={1}
            max={128}
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.workers}
            onChange={(event) => updateConfigField('workers', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">M4B bitrate</span>
          <select
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.m4b_bitrate}
            onChange={(event) => updateConfigField('m4b_bitrate', event.target.value)}
          >
            <option value="">Select bitrate</option>
            {withCurrentOption(configForm.m4b_bitrate, M4B_BITRATE_OPTIONS).map((bitrate) => (
              <option key={bitrate} value={bitrate}>
                {bitrate}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Line pause ms</span>
          <input
            type="number"
            min={0}
            max={30000}
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.pause_line_ms}
            onChange={(event) => updateConfigField('pause_line_ms', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Chapter pause ms</span>
          <input
            type="number"
            min={0}
            max={120000}
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.pause_chapter_ms}
            onChange={(event) => updateConfigField('pause_chapter_ms', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">NLP provider</span>
          <select
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.nlp_provider}
            onChange={(event) => {
              updateConfigField('nlp_provider', event.target.value);
              updateConfigField('nlp_model', '');
            }}
          >
            {NLP_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">NLP model</span>
          {configModelsLoading && (
            <p className="text-xs text-muted-foreground">Loading models...</p>
          )}
          {!configModelsLoading && configModelsError && (
            <p className="text-xs text-destructive">{configModelsError}</p>
          )}
          {!configModelsLoading && providerModelsUnavailable && (
            <p className="text-xs text-muted-foreground">
              Model discovery is unavailable for this runtime. Enter the model id manually.
            </p>
          )}
          {providerModelsUnavailable ? (
            <input
              className="box-border min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2"
              value={configForm.nlp_model}
              onChange={(event) => updateConfigField('nlp_model', event.target.value)}
              placeholder="llama3.2"
            />
          ) : (
            <ModelCombobox
              id="config-nlp-model"
              value={configForm.nlp_model}
              onChange={(value) => updateConfigField('nlp_model', value)}
              options={configModelOptions}
              placeholder="Search models"
              disabled={configModelsLoading}
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="font-medium">Ollama URL</span>
          <input
            type="url"
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
            value={configForm.ollama_url}
            onChange={(event) => updateConfigField('ollama_url', event.target.value)}
          />
        </label>
      </div>

      {configMessage && (
        <p className="rounded-md border border-[var(--color-success)]/25 bg-[rgb(111_138_101_/_12%)] px-3 py-2 text-sm text-[var(--color-success)]">
          {configMessage}
        </p>
      )}
      {configError && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {configError}
        </p>
      )}
    </section>
  );
}
