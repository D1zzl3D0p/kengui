import type { AnalysisResult } from '../../api/books';
import type { CloudAnalysisProgressView } from '../../api/cloudBooks';
import type { TaskResponse } from '../../api/tasks';

export type AuditionView = {
  status: string;
  progress: number;
  message: string;
  audioUrl?: string;
};

/**
 * Atomic state for the Step 3 analysis → cast → audition flow.
 *
 * Everything here mutates together during `runAnalysis` / `startAudition`, so it
 * lives in a single reducer to keep transitions consistent. Side effects (network
 * polling, cast suggestion) run in the component and only dispatch the results.
 */
export interface Step3FlowState {
  analyzing: boolean;
  analysisTask: TaskResponse<AnalysisResult> | null;
  analysisResult: AnalysisResult | null;
  cloudProgress: CloudAnalysisProgressView | null;
  speakerVoices: Record<string, string>;
  castWarnings: string[];
  auditions: Record<string, AuditionView>;
  error: string | null;
}

export const initialStep3FlowState: Step3FlowState = {
  analyzing: false,
  analysisTask: null,
  analysisResult: null,
  cloudProgress: null,
  speakerVoices: {},
  castWarnings: [],
  auditions: {},
  error: null,
};

export type Step3FlowAction =
  | { type: 'ANALYSIS_STARTED' }
  | { type: 'ANALYSIS_TASK_UPDATED'; task: TaskResponse<AnalysisResult> }
  | { type: 'CLOUD_PROGRESS'; progress: CloudAnalysisProgressView }
  | { type: 'ANALYSIS_SUCCEEDED'; result: AnalysisResult; speakerVoices: Record<string, string>; warnings: string[] }
  | { type: 'ANALYSIS_FAILED'; error: string }
  | { type: 'SPEAKER_VOICE_CHANGED'; characterId: string; voice: string }
  | { type: 'NARRATOR_VOICE_SYNCED'; voice: string }
  | { type: 'AUDITION_UPDATED'; key: string; view: AuditionView }
  | { type: 'ERROR_SET'; error: string }
  | { type: 'ERROR_CLEARED' };

export function step3VoiceReducer(state: Step3FlowState, action: Step3FlowAction): Step3FlowState {
  switch (action.type) {
    case 'ANALYSIS_STARTED':
      return {
        ...state,
        analyzing: true,
        error: null,
        castWarnings: [],
        analysisResult: null,
        cloudProgress: null,
      };
    case 'ANALYSIS_TASK_UPDATED':
      return { ...state, analysisTask: action.task };
    case 'CLOUD_PROGRESS':
      return { ...state, cloudProgress: action.progress };
    case 'ANALYSIS_SUCCEEDED':
      return {
        ...state,
        analyzing: false,
        error: null,
        analysisResult: action.result,
        speakerVoices: action.speakerVoices,
        castWarnings: action.warnings,
      };
    case 'ANALYSIS_FAILED':
      return { ...state, analyzing: false, error: action.error };
    case 'SPEAKER_VOICE_CHANGED':
      return {
        ...state,
        speakerVoices: { ...state.speakerVoices, [action.characterId]: action.voice },
      };
    case 'NARRATOR_VOICE_SYNCED':
      if (Object.keys(state.speakerVoices).length === 0) return state;
      return {
        ...state,
        speakerVoices: { ...state.speakerVoices, NARRATOR: action.voice },
      };
    case 'AUDITION_UPDATED':
      return {
        ...state,
        auditions: { ...state.auditions, [action.key]: action.view },
      };
    case 'ERROR_SET':
      return { ...state, error: action.error };
    case 'ERROR_CLEARED':
      return { ...state, error: null };
    default:
      return state;
  }
}
