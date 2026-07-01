import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeCommands, saveM4bFile } from '../platform';
import { cloudRequest } from './cloudClient';
import { createCloudJob, downloadCloudJob } from './cloudQueue';
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
      artifacts: [
        {
          artifact_id: 'final-1',
          artifact_type: 'final_output',
          purged_at: null,
        },
      ],
      runtime_invocation: null,
    });

    await downloadCloudJob('job-1');

    expect(cloudRequest).toHaveBeenCalledTimes(1);
    expect(nativeCommands.signedDownloadFile).not.toHaveBeenCalled();
  });
});
