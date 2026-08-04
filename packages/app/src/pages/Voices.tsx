import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Ear, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import {
  auditionAudioUrl,
  auditionVoice,
  downloadCompiledVoices,
  excludeVoice,
  fetchVoices,
  includeVoice,
  type VoicePreviewPhrase,
  type VoiceResponse,
} from '../api/voices';
import { fetchTask, type TaskResponse } from '../api/tasks';
import { useConnectionStore } from '../store/connection';

type TaskView = {
  taskId: string;
  progress: number;
  message: string;
  status: string;
  audioUrl?: string;
};

function voiceMatches(voice: VoiceResponse, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    voice.name,
    voice.display_label,
    voice.description,
    voice.gender,
    voice.accent,
    voice.dataset,
    voice.source,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

async function pollTask<T>(
  taskId: string,
  onUpdate: (task: TaskResponse<T>) => void
): Promise<TaskResponse<T>> {
  for (;;) {
    const task = await fetchTask<T>(taskId);
    onUpdate(task);
    if (task.status === 'completed' || task.status === 'failed') {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export default function Voices() {
  const isHosted = useConnectionStore((state) => state.serverMode === 'hosted');
  const [voices, setVoices] = useState<VoiceResponse[]>([]);
  const [phraseCatalog, setPhraseCatalog] = useState<VoicePreviewPhrase[]>([]);
  const [selectedPhraseId, setSelectedPhraseId] = useState('');
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const activePreviewRef = useRef<HTMLAudioElement | null>(null);
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState('all');
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadTask, setDownloadTask] = useState<TaskView | null>(null);
  const [auditions, setAuditions] = useState<Record<string, TaskView>>({});

  async function loadVoices() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchVoices();
      setVoices(response.voices);
      const phrases = response.phrase_catalog ?? [];
      setPhraseCatalog(phrases);
      setSelectedPhraseId((current) => {
        if (phrases.some((phrase) => phrase.phrase_id === current)) return current;
        if (response.default_phrase_id &&
            phrases.some((phrase) => phrase.phrase_id === response.default_phrase_id)) {
          return response.default_phrase_id;
        }
        return phrases[0]?.phrase_id ?? '';
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load voices.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVoices();
  }, []);

  function stopActivePreview() {
    const audio = activePreviewRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    activePreviewRef.current = null;
  }

  useEffect(() => {
    stopActivePreview();
    return stopActivePreview;
  }, [selectedPhraseId]);

  const genders = useMemo(
    () => Array.from(new Set(voices.map((voice) => voice.gender).filter(Boolean))).sort(),
    [voices]
  );
  const sources = useMemo(
    () => Array.from(new Set(voices.map((voice) => voice.source).filter(Boolean))).sort(),
    [voices]
  );
  const filteredVoices = useMemo(
    () =>
      voices.filter((voice) => {
        if (!voiceMatches(voice, query)) return false;
        if (gender !== 'all' && voice.gender !== gender) return false;
        if (source !== 'all' && voice.source !== source) return false;
        return true;
      }),
    [gender, query, source, voices]
  );

  async function toggleVoice(voice: VoiceResponse) {
    setError(null);
    setVoices((current) =>
      current.map((item) =>
        item.name === voice.name ? { ...item, excluded: !item.excluded } : item
      )
    );
    try {
      const result = voice.excluded
        ? await includeVoice(voice.name)
        : await excludeVoice(voice.name);
      setVoices((current) =>
        current.map((item) =>
          item.name === voice.name ? { ...item, excluded: !result.pool_enabled } : item
        )
      );
    } catch (error) {
      setVoices((current) =>
        current.map((item) =>
          item.name === voice.name ? { ...item, excluded: voice.excluded } : item
        )
      );
      setError(error instanceof Error ? error.message : 'Failed to update voice.');
    }
  }

  async function startDownload() {
    setError(null);
    try {
      const task = await downloadCompiledVoices();
      setDownloadTask({
        taskId: task.task_id,
        progress: task.progress,
        message: task.message,
        status: task.status,
      });
      const completed = await pollTask(task.task_id, (next) => {
        setDownloadTask({
          taskId: next.task_id,
          progress: next.progress,
          message: next.message,
          status: next.status,
        });
      });
      if (completed.status === 'failed') {
        setError(completed.error ?? 'Voice download failed.');
      } else {
        await loadVoices();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start voice download.');
    }
  }

  async function startAudition(voice: VoiceResponse) {
    setError(null);
    try {
      const task = await auditionVoice({ voice_name: voice.name });
      setAuditions((current) => ({
        ...current,
        [voice.name]: {
          taskId: task.task_id,
          progress: task.progress,
          message: task.message,
          status: task.status,
        },
      }));
      const completed = await pollTask(task.task_id, (next) => {
        setAuditions((current) => ({
          ...current,
          [voice.name]: {
            taskId: next.task_id,
            progress: next.progress,
            message: next.message,
            status: next.status,
          },
        }));
      });
      if (completed.status === 'failed') {
        setError(completed.error ?? 'Audition failed.');
        return;
      }
      setAuditions((current) => ({
        ...current,
        [voice.name]: {
          taskId: completed.task_id,
          progress: completed.progress,
          message: completed.message,
          status: completed.status,
          audioUrl: auditionAudioUrl(completed.task_id),
        },
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start audition.');
    }
  }

  async function startStaticPreview(voice: VoiceResponse) {
    setPreviewErrors((current) => {
      const next = { ...current };
      delete next[voice.name];
      return next;
    });
    const preview = voice.previews?.find((item) => item.phrase_id === selectedPhraseId);
    if (!preview) {
      setPreviewErrors((current) => ({
        ...current,
        [voice.name]: `No preview is available for ${voice.display_label} and this passage.`,
      }));
      return;
    }
    stopActivePreview();
    const audio = new Audio(preview.audio_url);
    activePreviewRef.current = audio;
    audio.addEventListener('ended', () => {
      if (activePreviewRef.current === audio) activePreviewRef.current = null;
    }, { once: true });
    audio.addEventListener('error', () => {
      setPreviewErrors((current) => ({
        ...current,
        [voice.name]: `Could not load the preview for ${voice.display_label}.`,
      }));
    }, { once: true });
    try {
      await audio.play();
    } catch (error) {
      setPreviewErrors((current) => ({
        ...current,
        [voice.name]: error instanceof Error ? error.message : 'Could not play this preview.',
      }));
    }
  }

  return (
    <Layout>
      <div className="flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Voices</p>
            <h1 className="text-3xl font-semibold">Voice Catalog</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {isHosted
                ? 'Browse and preview voices available for hosted narrator and cast assignment.'
                : 'Manage the voices available for narrator and cast assignment.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadVoices} disabled={loading}>
              <RefreshCw aria-hidden="true" />
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
            {!isHosted && (
              <Button aria-label="Download compiled voices" onClick={startDownload}>
                <Download aria-hidden="true" />
                Download compiled
              </Button>
            )}
          </div>
        </div>

        {isHosted && (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
            <p className="text-muted-foreground">
              Catalog management is unavailable in hosted mode. Hosted previews are free and do not consume credits.
            </p>
            {phraseCatalog.length > 0 && (
              <label className="flex max-w-xl flex-col gap-1">
                <span className="font-medium">Preview passage</span>
                <select
                  value={selectedPhraseId}
                  onChange={(event) => setSelectedPhraseId(event.target.value)}
                  className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
                >
                  {phraseCatalog.map((phrase) => (
                    <option key={phrase.phrase_id} value={phrase.phrase_id}>
                      {phrase.title} — {phrase.author}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)] md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Search</span>
            <div className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-card px-3">
              <Search className="size-4 text-muted-foreground" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Gender</span>
            <select
              className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
            >
              <option value="all">All</option>
              {genders.map((item) => (
                <option key={item} value={item ?? ''}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Source</span>
            <select
              className="min-h-10 rounded-md border border-input bg-card px-3 py-2"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="all">All</option>
              {sources.map((item) => (
                <option key={item} value={item ?? ''}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        {downloadTask && (
          <div className="rounded-md border bg-card px-3 py-2 text-sm">
            <span className="font-medium">Compiled voices:</span>{' '}
            {downloadTask.status} {downloadTask.progress}% · {downloadTask.message}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredVoices.map((voice) => {
            const audition = auditions[voice.name];
            return (
              <article key={voice.name} className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{voice.display_label}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{voice.source}</p>
                  </div>
                  <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>

                <p className="min-h-10 text-sm text-muted-foreground">{voice.description}</p>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Gender</dt>
                    <dd>{voice.gender ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Accent</dt>
                    <dd>{voice.accent ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Dataset</dt>
                    <dd>{voice.dataset ?? 'None'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Speaker</dt>
                    <dd>{voice.speaker_id ?? voice.name}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isHosted && !selectedPhraseId}
                    onClick={() => isHosted ? void startStaticPreview(voice) : void startAudition(voice)}
                  >
                    <Ear aria-hidden="true" />
                    {isHosted ? 'Preview' : 'Audition'}
                  </Button>
                  {!isHosted && (
                    <Button
                      size="sm"
                      variant={voice.excluded ? 'outline' : 'default'}
                      onClick={() => toggleVoice(voice)}
                    >
                      {voice.excluded ? 'Include' : 'Exclude'}
                    </Button>
                  )}
                </div>

                {previewErrors[voice.name] && (
                  <p className="text-xs text-destructive">{previewErrors[voice.name]}</p>
                )}

                {!isHosted && audition && (
                  <div className="rounded-md border bg-background/45 p-2 text-xs text-muted-foreground">
                    <p>
                      {audition.status} {audition.progress}% · {audition.message}
                    </p>
                    {audition.audioUrl && (
                      <audio className="mt-2 w-full" controls src={audition.audioUrl} />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
