import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeCommands, saveM4bFile } from '../platform';
import { cloudRequest } from './cloudClient';
import { createCloudJob, downloadCloudJob, fetchCloudQueue, normalizeRuntimeStatus } from './cloudQueue';
import type { JobCreateRequest } from './queue';

vi.mock('../platform', () => ({
  saveM4bFile: vi.fn(),
  nativeCommands: {
    fileStat: vi.fn(),
    signedUploadFile: vi.fn(),
    signedUploadText: vi.fn(),
    signedDownloadFile: vi.fn(),
  },
}));

vi.mock('./cloudClient', () => ({
  cloudRequest: vi.fn(),
}));

const request: JobCreateRequest = {
  ebook_path: '/books/great-book.epub',
  voice: 'alba',
  chapter_selection: { preset: 'content-only', included: [0, 1], excluded: [] },
  narration_mode: 'multi',
  name: 'Great Book',
  output_path: null,
  tts_execution_mode: 'local',
  speaker_voices: { alice: 'alba' },
  annotated_chapters_path: '/cache/annotated.json',
  chapter_voices: {},
  roster_cache_path: '/cache/roster.json',
  job_nlp_provider: 'openrouter',
  job_nlp_model: 'openai/gpt-4.1-mini',
  job_character_discovery_method: 'spacy',
  job_attribution_provider: 'openrouter',
  job_attribution_model: 'openai/gpt-4.1-mini',
  job_attribution_execution_mode: 'local',
};

describe('createCloudJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nativeCommands.fileStat).mockResolvedValue({
      path: '/books/great-book.epub',
      filename: 'great-book.epub',
      byteSize: 123,
      contentType: 'application/epub+zip',
    });
    vi.mocked(nativeCommands.signedUploadFile).mockResolvedValue(undefined);
    vi.mocked(nativeCommands.signedUploadText).mockResolvedValue(undefined);
    vi.mocked(nativeCommands.signedDownloadFile).mockResolvedValue(undefined);
    vi.mocked(saveM4bFile).mockResolvedValue('/downloads/job-1.m4b');
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'awaiting_upload' })
      .mockResolvedValueOnce({ artifact_id: 'source-1', upload_url: 'https://r2.example/source' })
      .mockResolvedValueOnce({ artifact_id: 'source-1' })
      .mockResolvedValueOnce({ artifact_id: 'bundle-1', upload_url: 'https://r2.example/job' })
      .mockResolvedValueOnce({ artifact_id: 'bundle-1' })
      .mockResolvedValueOnce({
        job_id: 'job-1',
        status: 'queued',
        invocation_id: 'invoke-1',
        invocation_status: 'queued',
      });
  });

  it('creates, uploads, confirms, bundles, and submits in order', async () => {
    await createCloudJob(request);

    expect(cloudRequest).toHaveBeenNthCalledWith(1, 'create-job', expect.any(Object));
    expect(cloudRequest).toHaveBeenNthCalledWith(2, 'sign-upload', expect.objectContaining({
      body: expect.stringContaining('"artifact_type":"source"'),
    }));
    expect(nativeCommands.signedUploadFile).toHaveBeenCalledWith({
      path: '/books/great-book.epub',
      url: 'https://r2.example/source',
      contentType: 'application/epub+zip',
    });
    expect(cloudRequest).toHaveBeenNthCalledWith(3, 'confirm-upload', expect.objectContaining({
      body: JSON.stringify({ artifact_id: 'source-1' }),
    }));
    expect(cloudRequest).toHaveBeenNthCalledWith(4, 'sign-upload', expect.objectContaining({
      body: expect.stringContaining('"artifact_type":"input_bundle"'),
    }));
    expect(cloudRequest).toHaveBeenNthCalledWith(6, 'submit-job', expect.objectContaining({
      body: JSON.stringify({ job_id: 'job-1' }),
    }));
  });

  it('removes local analysis cache paths from the hosted input bundle', async () => {
    await createCloudJob(request);

    const uploadText = vi.mocked(nativeCommands.signedUploadText).mock.calls[0]![0].text;
    const bundle = JSON.parse(uploadText);
    expect(bundle.job_config.annotated_chapters_path).toBeNull();
    expect(bundle.job_config.roster_cache_path).toBeNull();
    expect(bundle.nlp).toMatchObject({
      enabled: true,
      extraction_provider: 'openrouter',
      attribution_provider: 'openrouter',
    });
  });

  it('prompts for a download path before requesting a signed download URL', async () => {
    vi.mocked(cloudRequest).mockReset();
    vi.mocked(cloudRequest)
      .mockResolvedValueOnce({
        job: { job_id: 'job-1', status: 'completed' },
        artifacts: [
          {
            artifact_id: 'final-1',
            artifact_type: 'final_output',
            purged_at: null,
          },
        ],
        runtime_invocation: null,
      })
      .mockResolvedValueOnce({
        artifact_id: 'final-1',
        download_url: 'https://r2.example/download',
      });

    await downloadCloudJob('job-1');

    expect(saveM4bFile).toHaveBeenCalledWith('job-1.m4b');
    expect(cloudRequest).toHaveBeenNthCalledWith(1, 'get-job?job_id=job-1');
    expect(cloudRequest).toHaveBeenNthCalledWith(2, 'sign-download', expect.objectContaining({
      body: JSON.stringify({ artifact_id: 'final-1' }),
    }));
    expect(nativeCommands.signedDownloadFile).toHaveBeenCalledWith({
      url: 'https://r2.example/download',
      outputPath: '/downloads/job-1.m4b',
    });
  });

  it('does not request sign-download when the save dialog is cancelled', async () => {
    vi.mocked(cloudRequest).mockReset();
    vi.mocked(saveM4bFile).mockResolvedValue(null);
    vi.mocked(cloudRequest).mockResolvedValueOnce({
      job: { job_id: 'job-1', status: 'completed' },
      artifacts: [{ artifact_id: 'final-1', artifact_type: 'final_output', purged_at: null }],
      runtime_invocation: null,
    });
    await downloadCloudJob('job-1');
    expect(cloudRequest).toHaveBeenCalledTimes(1);
    expect(nativeCommands.signedDownloadFile).not.toHaveBeenCalled();
  });
});

describe('fetchCloudQueue runtime status mapping', () => {
  it.each(['running', 'queued'])(
    'keeps a %s cancellation request nonterminal until cancellation is acknowledged',
    async (invocationStatus) => {
      vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [{
        job_id: `cancel-${invocationStatus}`,
        status: 'cancel_requested',
        runtime_status: { status: 'cancel_requested' },
      }] });

      const item = (await fetchCloudQueue()).items[0];
      expect(item).toMatchObject({
        status: 'processing',
        provider_status: 'cancel_requested',
        current_chapter: 'Cancellation requested',
      });
      expect(item?.status).not.toBe('cancelled');
    }
  );

  it('preserves queued attempt zero while requiring a positive maximum', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [{
      job_id: 'queued-zero', status: 'queued', runtime_status: {
        status: 'queued', attempt: { current: 0, max: 3 },
      },
    }] });

    expect((await fetchCloudQueue()).items[0]?.runtimeStatus?.attempt).toEqual({
      current: 0,
      max: 3,
    });
  });

  it('projects only validated runtime status fields', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [{
      job_id: 'job-live', status: 'running',
      runtime_status: {
        status: 'running', observed_at: '2026-08-04T01:00:00Z', raw_secret: 'nope',
        attempt: { current: 2, max: 3, next_attempt_at: '2026-08-04T01:01:00Z', extra: true },
        progress: { stage: 'render', percent: 42, message: 'raw persisted text', updated_at: '2026-08-04T00:59:42Z', age_seconds: 18 },
        heartbeat: { at: '2026-08-04T00:59:56Z', age_seconds: 4, timeout_seconds: 60 },
        failure: { code: 'provider_unavailable', message: 'raw provider detail', retryable: true },
        watchdog: { state: 'recovered_retrying' },
      },
    }] });
    expect((await fetchCloudQueue()).items[0]?.runtimeStatus).toEqual({
      status: 'running', observedAt: '2026-08-04T01:00:00Z',
      attempt: { current: 2, max: 3, nextAttemptAt: '2026-08-04T01:01:00Z' },
      progress: { stage: 'render', percent: 42, message: 'Rendering audiobook', updatedAt: '2026-08-04T00:59:42Z', ageSeconds: 18 },
      heartbeat: { at: '2026-08-04T00:59:56Z', ageSeconds: 4, timeoutSeconds: 60 },
      failure: { code: 'provider_unavailable', message: 'Provider temporarily unavailable', retryable: true },
      watchdog: { state: 'recovered_retrying' },
    });
  });

  it('accepts the complete stable Edge vocabulary and derives curated messages', () => {
    const statuses = ['queued', 'running', 'completed', 'failed', 'cancel_requested', 'cancelled'];
    for (const status of statuses) {
      expect(normalizeRuntimeStatus({ status })?.status).toBe(status);
    }

    const expectedStages = {
      preflight: 'Preparing job', download: 'Downloading inputs', nlp: 'Analyzing book',
      analysis_extraction: 'Extracting book structure', analysis_attribution: 'Analyzing speaker attribution',
      render: 'Rendering audiobook', upload: 'Uploading results', completed: 'Runtime completed',
      cancelled: 'Runtime cancelled', failed: 'Runtime failed',
    };
    for (const [stage, message] of Object.entries(expectedStages)) {
      expect(normalizeRuntimeStatus({ progress: { stage, message: 'untrusted' } })?.progress)
        .toMatchObject({ stage, message });
    }

    const expectedFailures = {
      voice_unknown: 'Selected voice is unknown', voice_unavailable: 'Selected voice is unavailable',
      voice_asset_missing: 'Selected voice asset is missing', voice_incompatible: 'Selected voice is incompatible',
      model_incompatible: 'Speech model cache is missing or incompatible',
      provider_unavailable: 'Provider temporarily unavailable', worker_no_progress: 'Worker made no progress',
      heartbeat_timeout: 'Worker heartbeat timed out', worker_error: 'Worker failed',
      cancelled: 'Runtime was cancelled', unknown: 'Runtime failed',
    };
    for (const [code, message] of Object.entries(expectedFailures)) {
      expect(normalizeRuntimeStatus({ failure: { code, message: 'untrusted' } })?.failure)
        .toMatchObject({ code, message });
    }
  });

  it('fails closed on unknown runtime strings and never retains adversarial text', () => {
    const secret = 'Bearer token /Users/alice/private.epub payload excerpt';
    const normalized = normalizeRuntimeStatus({
      status: secret,
      progress: { stage: secret, message: secret, percent: 20 },
      failure: { code: secret, message: secret, retryable: false },
    });

    expect(normalized).toEqual({
      status: null,
      progress: { percent: 20 },
      failure: { code: 'unknown', message: 'Runtime failed', retryable: false },
    });
    expect(JSON.stringify(normalized)).not.toContain(secret);
  });

  it('fails closed on raw legacy cloud job status and failure strings', async () => {
    const secret = 'Bearer SECRET /Users/alice/private.epub';
    vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [{
      job_id: 'hostile', status: secret, error_message: secret,
      runtime_status: { status: 'failed', failure: { code: secret, message: secret } },
    }] });
    const item = (await fetchCloudQueue()).items[0];
    expect(item).toMatchObject({
      status: 'pending', provider_status: 'unknown',
      current_chapter: 'Cloud status unavailable', error_message: '',
    });
    expect(JSON.stringify(item)).not.toContain(secret);
  });

  it('uses stable cloud labels and normalized runtime failure copy', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [
      { job_id: 'running', status: 'running' },
      { job_id: 'failed', status: 'failed', error_message: 'raw detail', runtime_status: {
        status: 'failed', failure: { code: 'provider_unavailable', message: 'raw detail' },
      } },
    ] });
    const [running, failed] = (await fetchCloudQueue()).items;
    expect(running).toMatchObject({ provider_status: 'running', current_chapter: 'Running' });
    expect(failed).toMatchObject({
      provider_status: 'failed', current_chapter: 'Failed',
      error_message: 'Provider temporarily unavailable',
    });
  });

  it('preserves old responses and safely drops malformed runtime fields', async () => {
    vi.mocked(cloudRequest).mockResolvedValueOnce({ jobs: [
      { job_id: 'old', status: 'queued' },
      { job_id: 'bad', status: 'running', runtime_status: {
        status: 7, observed_at: 'not-a-date', attempt: { current: '2', max: -1 },
        progress: { percent: '42', updated_at: false, age_seconds: -2 },
        heartbeat: { at: [], age_seconds: '4', timeout_seconds: 0 },
        watchdog: { state: 'invented' }, failure: { retryable: 'yes' },
      } },
    ] });
    const result = await fetchCloudQueue();
    expect(result.items[0]?.runtimeStatus).toBeUndefined();
    expect(result.items[1]?.runtimeStatus).toEqual({ status: null });
  });
});
