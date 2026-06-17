import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ApiError } from '../../api/client';
import { createJob, startQueue } from '../../api/queue';
import type { WizardState } from './index';

interface Props {
  state: WizardState;
  onBack: () => void;
  onDone: () => void;
}

export default function Step4Review({ state, onBack, onDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = state.book.metadata?.title as string | undefined;

  function formatSubmitError(error: unknown): string {
    if (error instanceof ApiError) {
      try {
        const body = JSON.parse(error.message) as { detail?: unknown };
        if (typeof body.detail === 'string' && body.detail.trim()) {
          return `Failed to submit job: ${body.detail}`;
        }
      } catch {
        // Fall through to the raw response text below.
      }
      if (error.message.trim()) {
        return `Failed to submit job: ${error.message}`;
      }
    }
    if (error instanceof Error && error.message.trim()) {
      return `Failed to submit job: ${error.message}`;
    }
    return 'Failed to submit job. Please try again.';
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await createJob({
        ebook_path: state.filePath,
        voice: state.voice,
        narration_mode: state.narrationMode,
        chapter_selection: state.chapterSelection,
        name: title ?? null,
        output_path: null,
        tts_execution_mode: 'local',
        speaker_voices: state.narrationMode === 'multi' ? state.speakerVoices ?? {} : {},
        annotated_chapters_path:
          state.narrationMode === 'multi' ? state.annotatedChaptersPath ?? null : null,
        chapter_voices: {},
        roster_cache_path: state.narrationMode === 'multi' ? state.rosterCachePath ?? null : null,
        job_nlp_provider: state.narrationMode === 'multi' ? state.nlpProvider ?? null : null,
        job_nlp_model: state.narrationMode === 'multi' ? state.nlpModel ?? null : null,
        job_attribution_provider: state.narrationMode === 'multi' ? state.nlpProvider ?? null : null,
        job_attribution_model: state.narrationMode === 'multi' ? state.nlpModel ?? null : null,
      });
      try {
        await startQueue();
      } catch (error) {
        console.warn('Job submitted, but the queue could not be started.', error);
      }
      onDone();
    } catch (error) {
      setError(formatSubmitError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Review conversion</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Confirm your selections before adding to the queue.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Book
          </span>
          <span className="font-medium">{title ?? state.filePath}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Chapter preset
          </span>
          <span className="text-sm">{state.chapterPreset}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Chapter selection
          </span>
          <span className="text-sm">
            {state.chapterSelection.included.length} included,{' '}
            {state.chapterSelection.excluded.length} excluded
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Narration mode
          </span>
          <span className="text-sm capitalize">{state.narrationMode}</span>
        </div>

        {state.narrationMode === 'single' && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Voice
            </span>
            <span className="text-sm">{state.voice}</span>
          </div>
        )}

        {state.narrationMode === 'multi' && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Narrator
              </span>
              <span className="text-sm">{state.voice}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                NLP
              </span>
              <span className="text-sm">
                {state.nlpProvider} {state.nlpModel}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Cast
              </span>
              <span className="text-sm">
                {state.characters?.length ?? 0} character{state.characters?.length === 1 ? '' : 's'}
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button aria-label="Submit conversion" onClick={handleSubmit} disabled={loading}>
          <CheckCircle2 aria-hidden="true" />
          {loading ? 'Submitting...' : 'Start Conversion'}
        </Button>
      </div>
    </div>
  );
}
