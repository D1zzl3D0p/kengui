import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import Step1Book from './Step1Book';
import Step2Chapters from './Step2Chapters';
import Step3Voice from './Step3Voice';
import Step4Review from './Step4Review';
import type { AnalysisCharacter, BookParseResponse, ChapterPreset } from '../../api/books';
import type { ChapterSelection, NarrationMode } from '../../api/queue';

export interface WizardState {
  filePath: string;
  book: BookParseResponse;
  chapterPreset: ChapterPreset;
  chapterSelection: ChapterSelection;
  narrationMode: NarrationMode;
  voice: string;
  nlpProvider?: string;
  nlpModel?: string;
  discoveryMethod?: 'auto' | 'llm' | 'booknlp' | 'spacy';
  speakerVoices?: Record<string, string>;
  annotatedChaptersPath?: string | null;
  rosterCachePath?: string | null;
  characters?: AnalysisCharacter[];
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Add book', 'Chapters', 'Choose voice', 'Review'];




export default function AddJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [_state, setState] = useState<Partial<WizardState>>({});

  function StepIndicator() {
    return (
      <div className="mb-8 flex flex-wrap gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium ${
                i + 1 === step
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i + 1 < step
                    ? 'border-[var(--color-success)] bg-[rgb(111_138_101_/_18%)] text-[var(--color-success)]'
                    : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className="text-sm text-muted-foreground">{label}</span>
            {i < STEP_LABELS.length - 1 && (
              <span className="text-muted-foreground">→</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-medium text-primary">Convert</p>
        <h1 className="mb-2 text-3xl font-semibold">Add Book</h1>
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
          Follow the simple path: add a book, choose chapters, select a voice, then start conversion.
        </p>
        <StepIndicator />

        {step === 1 && (
          <Step1Book
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <Step2Chapters
            book={_state.book!}
            onBack={() => setStep(1)}
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <Step3Voice
            filePath={_state.filePath!}
            onBack={() => setStep(2)}
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(4);
            }}
          />
        )}
        {step === 4 && (
          <Step4Review
            state={_state as WizardState}
            onBack={() => setStep(3)}
            onDone={() => navigate('/dashboard')}
          />
        )}
      </div>
    </Layout>
  );
}
