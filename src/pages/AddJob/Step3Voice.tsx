import { useEffect, useMemo, useState } from 'react';
import { Mic2, RefreshCw, UsersRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ModelCombobox } from '../../components/ModelCombobox';
import { analyzeBook, fetchAnalysisCaches, type AnalysisCacheCandidate, type AnalysisCharacter, type AnalysisResult } from '../../api/books';
import { fetchTask, type TaskResponse } from '../../api/tasks';
import { fetchMultivoiceStatus, type MultivoiceStatusResponse } from '../../api/status';
import { fetchVoices, suggestCast, type VoiceResponse } from '../../api/voices';
import { fetchConfig } from '../../api/config';
import type { NarrationMode } from '../../api/queue';
import { NLP_PROVIDER_OPTIONS } from '../../lib/providerCatalog';
import { useProviderModels } from '../../hooks/useProviderModels';
import { createEmptySeries, fetchSeries, type SeriesModel } from '../../api/series';

const DEFAULT_NARRATOR_VOICE = 'alba';

type CharacterDiscoveryMethod = 'auto' | 'llm' | 'booknlp' | 'spacy';

const CHARACTER_DISCOVERY_OPTIONS: Array<{
  value: CharacterDiscoveryMethod;
  label: string;
  description: string;
}> = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Try BookNLP first, then fall back to LLM discovery.',
  },
  {
    value: 'llm',
    label: 'LLM',
    description: 'Use the selected NLP provider directly.',
  },
  {
    value: 'booknlp',
    label: 'BookNLP',
    description: 'Use BookNLP character discovery only.',
  },
  {
    value: 'spacy',
    label: 'spaCy',
    description: 'Use spaCy named-entity recognition only.',
  },
];

function validateAnalysisResult(result: AnalysisResult): AnalysisCharacter[] {
  // The backend contract says `characters` is an array. Keep that boundary
  // explicit so a stale/partial runtime cannot crash React into a white screen.
  if (!Array.isArray(result.characters)) {
    throw new Error('Analysis completed without a character roster. Please update kenkui and retry.');
  }
  return result.characters;
}

function newestCacheId(candidates: AnalysisCacheCandidate[]): string {
  return [...candidates].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '');
    const bTime = Date.parse(b.created_at || '');
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  })[0]?.cache_id ?? '';
}

interface Step3Data {
  narrationMode: NarrationMode;
  voice: string;
  nlpProvider?: string;
  nlpModel?: string;
  discoveryMethod?: CharacterDiscoveryMethod;
  speakerVoices?: Record<string, string>;
  annotatedChaptersPath?: string | null;
  rosterCachePath?: string | null;
  characters?: AnalysisCharacter[];
  seriesSlug?: string | null;
}

interface Props {
  filePath: string;
  onBack: () => void;
  onNext: (data: Step3Data) => void;
}

async function pollAnalysisTask(
  taskId: string,
  onUpdate: (task: TaskResponse<AnalysisResult>) => void
) {
  for (;;) {
    const task = await fetchTask<AnalysisResult>(taskId);
    onUpdate(task);
    if (task.status === 'completed' || task.status === 'failed') {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}

export default function Step3Voice({ filePath, onBack, onNext }: Props) {
  const [narrationMode, setNarrationMode] = useState<NarrationMode>('single');
  const [voices, setVoices] = useState<VoiceResponse[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [nlpProvider, setNlpProvider] = useState('ollama');
  const [nlpModel, setNlpModel] = useState('llama3.2');
  const [discoveryMethod, setDiscoveryMethod] = useState<CharacterDiscoveryMethod>('auto');
  const [multivoiceStatus, setMultivoiceStatus] = useState<MultivoiceStatusResponse | null>(null);
  const [analysisTask, setAnalysisTask] = useState<TaskResponse<AnalysisResult> | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, string>>({});
  const [castWarnings, setCastWarnings] = useState<string[]>([]);
  const [cacheCandidates, setCacheCandidates] = useState<AnalysisCacheCandidate[]>([]);
  const [selectedCacheId, setSelectedCacheId] = useState('');
  const [cacheLoading, setCacheLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesModel[]>([]);
  const [selectedSeriesSlug, setSelectedSeriesSlug] = useState<string>('');
  const [newSeriesName, setNewSeriesName] = useState('');
  const [seriesCreating, setSeriesCreating] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const {
    models: nlpModelOptions,
    loading: nlpModelsLoading,
    error: nlpModelsError,
  } = useProviderModels(nlpProvider);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchVoices()
      .then((data) => {
        setVoices(data.voices);
        const firstVoice = data.voices.find((v) => !v.excluded);
        if (firstVoice) {
          setSelectedVoice(firstVoice.name);
        }
      })
      .catch(() => setError('Failed to load voices.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchConfig()
      .then(({ config }) => {
        const provider = typeof config.nlp_provider === 'string' ? config.nlp_provider : '';
        const model = typeof config.nlp_model === 'string' ? config.nlp_model : '';
        const method = typeof config.nlp_discovery_method === 'string' ? config.nlp_discovery_method : '';
        if (provider) setNlpProvider(provider);
        if (model) setNlpModel(model);
        if (['auto', 'llm', 'booknlp', 'spacy'].includes(method)) {
          setDiscoveryMethod(method as CharacterDiscoveryMethod);
        }
      })
      .catch(() => {
        // Config defaults are a convenience; keep local fallbacks if unavailable.
      });
  }, []);

  useEffect(() => {
    fetchSeries()
      .then((data) => setSeriesList(data.series))
      .catch(() => setSeriesList([]));
  }, []);

  useEffect(() => {
    if (narrationMode !== 'multi') return;
    setCacheLoading(true);
    fetchAnalysisCaches({ ebook_path: filePath })
      .then((data) => {
        setCacheCandidates(data.candidates);
        setSelectedCacheId(newestCacheId(data.candidates));
      })
      .catch(() => {
        setCacheCandidates([]);
        setSelectedCacheId('');
      })
      .finally(() => setCacheLoading(false));
  }, [filePath, narrationMode]);

  useEffect(() => {
    if (narrationMode !== 'multi') return;
    fetchMultivoiceStatus()
      .then(setMultivoiceStatus)
      .catch(() => setMultivoiceStatus(null));
  }, [narrationMode]);

  useEffect(() => {
    setSpeakerVoices((current) =>
      Object.keys(current).length > 0 ? { ...current, NARRATOR: selectedVoice } : current
    );
  }, [selectedVoice]);

  const availableVoices = useMemo(
    () => voices.filter((voice) => !voice.excluded),
    [voices]
  );
  const excludedVoiceNames = useMemo(
    () => voices.filter((voice) => voice.excluded).map((voice) => voice.name),
    [voices]
  );
  const selectedCache = useMemo(
    () => cacheCandidates.find((candidate) => candidate.cache_id === selectedCacheId),
    [cacheCandidates, selectedCacheId]
  );

  const voicesByGender = useMemo(() => {
    const groups: Record<string, VoiceResponse[]> = {};
    for (const v of availableVoices) {
      const key = v.gender ?? 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    }
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
  }, [availableVoices]);

  async function runAnalysis(useCache = false, cacheCandidate?: AnalysisCacheCandidate) {
    const narratorVoice = selectedVoice || DEFAULT_NARRATOR_VOICE;
    const requestProvider = cacheCandidate?.provider || nlpProvider;
    const requestModel = cacheCandidate?.model || nlpModel;
    setAnalyzing(true);
    setError(null);
    setCastWarnings([]);
    setAnalysisResult(null);
    try {
      const task = await analyzeBook({
        ebook_path: filePath,
        nlp_provider: requestProvider,
        nlp_model: requestModel,
        discovery_method: cacheCandidate?.method || discoveryMethod,
        attribution_provider: requestProvider,
        attribution_model: requestModel,
        use_cache: useCache,
      });
      setAnalysisTask(task);
      const completed = await pollAnalysisTask(task.task_id, setAnalysisTask);
      if (completed.status === 'failed' || !completed.result) {
        throw new Error(completed.error ?? 'Analysis failed.');
      }
      const characters = validateAnalysisResult(completed.result);
      setAnalysisResult(completed.result);
      const suggested = await suggestCast(
        characters,
        excludedVoiceNames,
        narratorVoice
      );
      setCastWarnings(suggested.warnings);
      setSpeakerVoices({
        ...suggested.speaker_voices,
        NARRATOR: narratorVoice,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreateSeries() {
    const name = newSeriesName.trim();
    if (!name) return;
    setSeriesCreating(true);
    setSeriesError(null);
    try {
      const created = await createEmptySeries(name);
      setSeriesList((current) => [
        created,
        ...current.filter((series) => series.slug !== created.slug),
      ]);
      setSelectedSeriesSlug(created.slug);
      setNewSeriesName('');
    } catch (error) {
      setSeriesError(error instanceof Error ? error.message : 'Failed to create series.');
    } finally {
      setSeriesCreating(false);
    }
  }

  function handleNext() {
    const narratorVoice = selectedVoice || DEFAULT_NARRATOR_VOICE;
    if (narrationMode === 'single') {
      onNext({ narrationMode: 'single', voice: narratorVoice, seriesSlug: selectedSeriesSlug || null });
      return;
    }
    if (!analysisResult) return;
    onNext({
      narrationMode: 'multi',
      voice: narratorVoice,
      nlpProvider,
      nlpModel,
      discoveryMethod,
      speakerVoices: { ...speakerVoices, NARRATOR: narratorVoice },
      annotatedChaptersPath: analysisResult.annotated_chapters_path,
      rosterCachePath: analysisResult.roster_cache_path,
      characters: analysisResult.characters,
      seriesSlug: selectedSeriesSlug || null,
    });
  }

  const nextDisabled =
    loading ||
    !selectedVoice ||
    (narrationMode === 'multi' && (!analysisResult || analyzing || nlpModelsLoading || !nlpModel));
  const modelDiscoveryUnsupported =
    nlpModelsError?.includes('does not support provider model discovery') ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Choose voice</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Choose the narrator voice and optional character cast.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant={narrationMode === 'single' ? 'default' : 'outline'}
          className="min-h-11 justify-start"
          onClick={() => setNarrationMode('single')}
        >
          <Mic2 aria-hidden="true" />
          Single voice
        </Button>
        <Button
          variant={narrationMode === 'multi' ? 'default' : 'outline'}
          className="min-h-11 justify-start"
          onClick={() => setNarrationMode('multi')}
        >
          <UsersRound aria-hidden="true" />
          Multi-voice
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <label htmlFor="voice-select" className="text-sm font-medium">
          Narrator voice
        </label>
        {loading && (
          <p className="text-sm text-muted-foreground">Loading voices...</p>
        )}
        {!loading && (
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            {availableVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.display_label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <label htmlFor="series-select" className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Series (optional)</span>
          <select
            id="series-select"
            value={selectedSeriesSlug}
            onChange={(e) => setSelectedSeriesSlug(e.target.value)}
            className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
          >
            <option value="">None — treat as standalone book</option>
            {seriesList.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Add series metadata for this book. Multi-voice jobs can also use it for voice continuity.
          </span>
        </label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label htmlFor="new-series-name" className="flex flex-col gap-1 text-sm">
            <span className="font-medium">New series name</span>
            <input
              id="new-series-name"
              value={newSeriesName}
              onChange={(e) => setNewSeriesName(e.target.value)}
              className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
              placeholder="The Expanse"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="self-end"
            onClick={() => void handleCreateSeries()}
            disabled={seriesCreating || !newSeriesName.trim()}
          >
            {seriesCreating ? 'Creating...' : 'Create series'}
          </Button>
        </div>
        {seriesError && (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {seriesError}
          </p>
        )}
      </div>

      {narrationMode === 'multi' && (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="grid gap-3 md:grid-cols-3">
            <label htmlFor="character-discovery-select" className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Character discovery</span>
              <select
                id="character-discovery-select"
                value={discoveryMethod}
                onChange={(e) => setDiscoveryMethod(e.target.value as CharacterDiscoveryMethod)}
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
              >
                {CHARACTER_DISCOVERY_OPTIONS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {CHARACTER_DISCOVERY_OPTIONS.find((method) => method.value === discoveryMethod)?.description}
              </span>
            </label>
            <label htmlFor="nlp-provider-select" className="flex flex-col gap-1 text-sm">
              <span className="font-medium">NLP provider</span>
              <select
                id="nlp-provider-select"
                value={nlpProvider}
                onChange={(e) => {
                  setNlpProvider(e.target.value);
                  setNlpModel('');
                }}
                className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
              >
                {NLP_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="nlp-model-select" className="flex flex-col gap-1 text-sm">
              <span className="font-medium">NLP model</span>
              {nlpModelsLoading && (
                <p className="text-xs text-muted-foreground">Loading models...</p>
              )}
              {!nlpModelsLoading && nlpModelsError && (
                <p className="text-xs text-destructive">{nlpModelsError}</p>
              )}
              {modelDiscoveryUnsupported ? (
                <input
                  id="nlp-model-select"
                  value={nlpModel}
                  onChange={(e) => setNlpModel(e.target.value)}
                  className="box-border min-h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2"
                  placeholder="llama3.2"
                />
              ) : (
                <ModelCombobox
                  id="nlp-model-select"
                  value={nlpModel}
                  onChange={setNlpModel}
                  options={nlpModelOptions}
                  placeholder="Search models"
                  disabled={nlpModelsLoading}
                />
              )}
            </label>
          </div>

          {multivoiceStatus && (
            <p className="rounded-md border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
              {multivoiceStatus.message}
            </p>
          )}

          {cacheCandidates.length > 0 && (
            <div className="rounded-md border bg-background/45 p-3 text-sm">
              <h3 className="font-medium">Reuse an existing analysis</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The most recent cache is selected automatically. Run a fresh analysis if you want new NLP work.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {cacheCandidates.map((candidate) => (
                  <label
                    key={candidate.cache_id}
                    className="flex gap-2 rounded-md border bg-card p-3"
                  >
                    <input
                      type="radio"
                      name="analysis-cache"
                      value={candidate.cache_id}
                      checked={selectedCacheId === candidate.cache_id}
                      onChange={() => setSelectedCacheId(candidate.cache_id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {candidate.description || `${candidate.step} cache`}
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">
                        step={candidate.step} · method={candidate.method || 'n/a'} · provider={candidate.provider || 'n/a'} · model={candidate.model || 'n/a'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {candidate.character_count} characters · {candidate.chapter_count} chapters · {candidate.quote_count} quotes
                        {candidate.created_at ? ` · ${candidate.created_at}` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {cacheLoading && (
            <p className="rounded-md border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
              Looking for reusable analysis caches...
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              className="w-fit"
              onClick={() => void runAnalysis(false)}
              disabled={
                analyzing ||
                loading ||
                (narrationMode === 'multi' && (nlpModelsLoading || !nlpModel))
              }
            >
              <RefreshCw aria-hidden="true" />
              {analyzing ? 'Analyzing...' : 'Analyze cast'}
            </Button>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => void runAnalysis(true, selectedCache)}
              disabled={
                analyzing ||
                loading ||
                !selectedCache ||
                (narrationMode === 'multi' && nlpModelsLoading)
              }
            >
              Use selected cache
            </Button>
          </div>

          {analysisTask && (
            <p className="rounded-md border bg-background/45 px-3 py-2 text-sm text-muted-foreground">
              {analysisTask.message?.toLowerCase().includes('attribut')
                ? '✦ Attribution'
                : '✦ Character discovery'}{' '}
              — {analysisTask.status} {analysisTask.progress}%
              {analysisTask.message ? ` · ${analysisTask.message}` : ''}
            </p>
          )}

          {castWarnings.length > 0 && (
            <div className="rounded-md border border-[rgb(184_155_77_/_35%)] bg-[rgb(184_155_77_/_15%)] px-3 py-2 text-sm">
              {castWarnings.join(' ')}
            </div>
          )}

          {analysisResult && (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="font-medium">Cast</h3>
                <p className="text-xs text-muted-foreground">
                  Analysis source: {analysisResult.cache_status === 'hit' ? 'cached result' : 'fresh run'}
                </p>
              </div>
              <label
                className="grid gap-2 rounded-md border bg-background/45 p-3 text-sm md:grid-cols-[minmax(0,1fr)_14rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">Narrator</span>
                  <span className="text-xs text-muted-foreground">
                    Framing voice for narration and non-dialogue passages
                  </span>
                </span>
                <select
                  aria-label="Voice for Narrator"
                  className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                  value={selectedVoice}
                  onChange={(event) => setSelectedVoice(event.target.value)}
                >
                  {Object.entries(voicesByGender).map(([genderLabel, gVoices]) => (
                    <optgroup key={genderLabel} label={genderLabel}>
                      {gVoices.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.display_label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {analysisResult.characters.map((character) => (
                <label
                  key={character.character_id}
                  className="grid gap-2 rounded-md border bg-background/45 p-3 text-sm md:grid-cols-[minmax(0,1fr)_14rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{character.display_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {character.quote_count} quotes · {character.mention_count} mentions
                      {character.gender_pronoun && (
                        <span className="ml-1">· {character.gender_pronoun}</span>
                      )}
                    </span>
                  </span>
                  <select
                    className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                    value={speakerVoices[character.character_id] ?? selectedVoice}
                    onChange={(event) =>
                      setSpeakerVoices((current) => ({
                        ...current,
                        [character.character_id]: event.target.value,
                      }))
                    }
                  >
                    {Object.entries(voicesByGender).map(([genderLabel, gVoices]) => (
                      <optgroup key={genderLabel} label={genderLabel}>
                        {gVoices.map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.display_label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button disabled={nextDisabled} onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
