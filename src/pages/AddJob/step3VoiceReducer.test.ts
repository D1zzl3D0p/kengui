import { describe, it, expect } from 'vitest';
import {
  step3VoiceReducer,
  initialStep3FlowState,
  type Step3FlowState,
} from './step3VoiceReducer';
import type { AnalysisResult } from '../../api/books';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    characters: [
      { character_id: 'alice', display_name: 'Alice', quote_count: 4, mention_count: 12, gender_pronoun: 'she' },
    ],
    book_hash: 'hash123',
    annotated_chapters_path: '/cache/annotated.json',
    roster_cache_path: '/cache/roster.json',
    nlp_provider: 'ollama',
    nlp_model: 'llama3.2',
    attribution_provider: 'ollama',
    attribution_model: 'llama3.2',
    cache_status: 'miss',
    ...overrides,
  };
}

describe('step3VoiceReducer', () => {
  it('starts from an idle flow state', () => {
    expect(initialStep3FlowState).toEqual({
      analyzing: false,
      analysisTask: null,
      analysisResult: null,
      cloudProgress: null,
      speakerVoices: {},
      castWarnings: [],
      auditions: {},
      error: null,
    });
  });

  it('ANALYSIS_STARTED clears prior results/warnings/cloud progress and marks analyzing', () => {
    const prev: Step3FlowState = {
      ...initialStep3FlowState,
      analysisResult: makeResult(),
      castWarnings: ['old warning'],
      cloudProgress: { status: 'running', percent: 10, message: 'x' },
      error: 'boom',
    };
    const next = step3VoiceReducer(prev, { type: 'ANALYSIS_STARTED' });
    expect(next.analyzing).toBe(true);
    expect(next.analysisResult).toBeNull();
    expect(next.castWarnings).toEqual([]);
    expect(next.cloudProgress).toBeNull();
    expect(next.error).toBeNull();
  });

  it('ANALYSIS_TASK_UPDATED records the latest polled task', () => {
    const task = { task_id: 't1', type: 'full_analysis', status: 'running', progress: 40, message: 'Working', result: null, error: null } as never;
    const next = step3VoiceReducer(initialStep3FlowState, { type: 'ANALYSIS_TASK_UPDATED', task });
    expect(next.analysisTask).toBe(task);
  });

  it('CLOUD_PROGRESS records cloud progress view', () => {
    const progress = { status: 'running', percent: 55, message: 'Attribution' };
    const next = step3VoiceReducer(initialStep3FlowState, { type: 'CLOUD_PROGRESS', progress });
    expect(next.cloudProgress).toBe(progress);
  });

  it('ANALYSIS_SUCCEEDED stores result, cast and warnings atomically and stops analyzing', () => {
    const prev = step3VoiceReducer(initialStep3FlowState, { type: 'ANALYSIS_STARTED' });
    const result = makeResult();
    const next = step3VoiceReducer(prev, {
      type: 'ANALYSIS_SUCCEEDED',
      result,
      speakerVoices: { alice: 'dave', NARRATOR: 'alba' },
      warnings: ['heads up'],
    });
    expect(next.analyzing).toBe(false);
    expect(next.analysisResult).toBe(result);
    expect(next.speakerVoices).toEqual({ alice: 'dave', NARRATOR: 'alba' });
    expect(next.castWarnings).toEqual(['heads up']);
    expect(next.error).toBeNull();
  });

  it('ANALYSIS_FAILED sets error and stops analyzing', () => {
    const prev = step3VoiceReducer(initialStep3FlowState, { type: 'ANALYSIS_STARTED' });
    const next = step3VoiceReducer(prev, { type: 'ANALYSIS_FAILED', error: 'Analysis failed.' });
    expect(next.analyzing).toBe(false);
    expect(next.error).toBe('Analysis failed.');
  });

  it('SPEAKER_VOICE_CHANGED updates a single character voice', () => {
    const prev: Step3FlowState = { ...initialStep3FlowState, speakerVoices: { alice: 'alba' } };
    const next = step3VoiceReducer(prev, { type: 'SPEAKER_VOICE_CHANGED', characterId: 'alice', voice: 'dave' });
    expect(next.speakerVoices).toEqual({ alice: 'dave' });
  });

  it('NARRATOR_VOICE_SYNCED updates NARRATOR only when a cast already exists', () => {
    const empty = step3VoiceReducer(initialStep3FlowState, { type: 'NARRATOR_VOICE_SYNCED', voice: 'dave' });
    expect(empty.speakerVoices).toEqual({});

    const withCast: Step3FlowState = { ...initialStep3FlowState, speakerVoices: { alice: 'alba', NARRATOR: 'alba' } };
    const synced = step3VoiceReducer(withCast, { type: 'NARRATOR_VOICE_SYNCED', voice: 'dave' });
    expect(synced.speakerVoices).toEqual({ alice: 'alba', NARRATOR: 'dave' });
  });

  it('AUDITION_UPDATED sets an audition view by key without disturbing others', () => {
    const prev: Step3FlowState = { ...initialStep3FlowState, auditions: { bob: { status: 'completed', progress: 100, message: 'Ready' } } };
    const next = step3VoiceReducer(prev, {
      type: 'AUDITION_UPDATED',
      key: 'alice',
      view: { status: 'running', progress: 20, message: 'Queued' },
    });
    expect(next.auditions.alice).toEqual({ status: 'running', progress: 20, message: 'Queued' });
    expect(next.auditions.bob).toEqual({ status: 'completed', progress: 100, message: 'Ready' });
  });

  it('ERROR_SET and ERROR_CLEARED manage the error field', () => {
    const set = step3VoiceReducer(initialStep3FlowState, { type: 'ERROR_SET', error: 'Failed to start audition.' });
    expect(set.error).toBe('Failed to start audition.');
    const cleared = step3VoiceReducer(set, { type: 'ERROR_CLEARED' });
    expect(cleared.error).toBeNull();
  });
});
