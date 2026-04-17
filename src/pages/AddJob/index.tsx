import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import Step1Book from './Step1Book';
import Step2Chapters from './Step2Chapters';
import Step3Voice from './Step3Voice';
import type { BookParseResponse, ChapterPreset } from '../../api/books';
import type { NarrationMode } from '../../api/queue';

export interface WizardState {
  filePath: string;
  book: BookParseResponse;
  chapterPreset: ChapterPreset;
  narrationMode: NarrationMode;
  voice: string;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Book', 'Chapters', 'Narration', 'Review'];



function Step4Placeholder({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Step 4: Review (coming soon)</p>
      <div className="flex gap-2">
        <button onClick={onBack}>Back</button>
        <button onClick={onDone}>Submit</button>
      </div>
    </div>
  );
}

export default function AddJob() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [_state, setState] = useState<Partial<WizardState>>({});

  function StepIndicator() {
    return (
      <div className="flex gap-2 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                i + 1 === step
                  ? 'bg-primary text-primary-foreground'
                  : i + 1 < step
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
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
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Add Book</h1>
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
            onBack={() => setStep(2)}
            onNext={(data) => {
              setState((s) => ({ ...s, ...data }));
              setStep(4);
            }}
          />
        )}
        {step === 4 && (
          <Step4Placeholder
            onBack={() => setStep(3)}
            onDone={() => navigate('/dashboard')}
          />
        )}
      </div>
    </Layout>
  );
}
