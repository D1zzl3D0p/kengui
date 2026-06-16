import { useState, useEffect } from 'react';
import { Mic2, UsersRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { fetchVoices } from '../../api/voices';
import type { VoiceResponse } from '../../api/voices';
import type { NarrationMode } from '../../api/queue';

type NlpMode = 'booknlp' | 'ollama';
const DEFAULT_NARRATOR_VOICE = 'alba';

interface Step3Data {
  narrationMode: NarrationMode;
  voice: string;
  nlpMode?: NlpMode;
}

interface Props {
  onBack: () => void;
  onNext: (data: Step3Data) => void;
}

export default function Step3Voice({ onBack, onNext }: Props) {
  const [narrationMode, setNarrationMode] = useState<NarrationMode>('single');
  const [voices, setVoices] = useState<VoiceResponse[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [nlpMode, setNlpMode] = useState<NlpMode>('booknlp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchVoices()
      .then((data) => {
        const available = data.voices.filter((v) => !v.excluded);
        setVoices(available);
        const firstVoice = available[0];
        if (firstVoice) {
          setSelectedVoice(firstVoice.name);
        }
      })
      .catch(() => setError('Failed to load voices.'))
      .finally(() => setLoading(false));
  }, []);

  function handleNext() {
    const narratorVoice = selectedVoice || DEFAULT_NARRATOR_VOICE;
    if (narrationMode === 'single') {
      onNext({ narrationMode: 'single', voice: narratorVoice });
    } else {
      onNext({ narrationMode: 'multi', voice: narratorVoice, nlpMode });
    }
  }

  const nextDisabled = loading || (narrationMode === 'single' && !selectedVoice);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Choose voice</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Choose how the audiobook will be narrated.
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

      {narrationMode === 'single' && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <label htmlFor="voice-select" className="text-sm font-medium">
            Voice
          </label>
          {loading && (
            <p className="text-sm text-muted-foreground">Loading voices…</p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {!loading && !error && (
            <select
              id="voice-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="min-h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.display_label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {narrationMode === 'multi' && (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          <div className="flex flex-col gap-2">
            <label htmlFor="nlp-mode-select" className="text-sm font-medium">
              NLP mode
            </label>
            <select
              id="nlp-mode-select"
              value={nlpMode}
              onChange={(e) => setNlpMode(e.target.value as NlpMode)}
              className="min-h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="booknlp">BookNLP</option>
              <option value="ollama">Ollama LLM</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            Characters will be detected automatically. Gender-pooled voices are
            assigned to each character.
          </p>
          {nlpMode === 'ollama' && (
            <p className="rounded-md border border-[rgb(184_155_77_/_35%)] bg-[rgb(184_155_77_/_15%)] px-3 py-2 text-sm text-[var(--color-ink)]">
              Ollama LLM may take longer to scan the book before narration begins.
            </p>
          )}
        </div>
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
