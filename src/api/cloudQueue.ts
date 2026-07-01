import { nativeCommands, saveM4bFile } from '../platform';
import { useConnectionStore } from '../store/connection';
import { cloudRequest } from './cloudClient';
import type { JobCreateRequest, JobResponse, JobStatus, QueueResponse } from './queue';

type CloudJobStatus =
  | 'awaiting_upload'
  | 'awaiting_submit'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'purged';

interface CloudJobRow {
  job_id: string;
  status: CloudJobStatus | string;
  source_filename?: string | null;
  source_content_type?: string | null;
  requested_runtime?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  error_message?: string | null;
}

interface CloudArtifactRow {
  artifact_id: string;
  artifact_type: string;
  content_type?: string | null;
  byte_size?: number | null;
  purged_at?: string | null;
}

interface CloudRuntimeInvocation {
  invocation_id: string;
  status: string;
}

interface CloudJobDetail {
  job: CloudJobRow;
  artifacts: CloudArtifactRow[];
  runtime_invocation: CloudRuntimeInvocation | null;
}

interface CreateCloudJobResponse {
  job_id: string;
  status: string;
}

interface SignUploadResponse {
  artifact_id: string;
  upload_url: string;
}

interface SubmitCloudJobResponse {
  job_id: string;
  status: string;
  invocation_id: string;
  invocation_status: string;
}

interface SignDownloadResponse {
  artifact_id: string;
  download_url: string;
  content_type?: string | null;
}

const CLOUD_SOURCE_CONTENT_TYPES = new Set([
  'application/epub+zip',
  'application/pdf',
  'text/plain',
]);

function isoSeconds(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function mapCloudStatus(status: string): JobStatus {
  if (status === 'running') return 'processing';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled' || status === 'purged') return 'cancelled';
  return 'pending';
}

function mapCloudJob(row: CloudJobRow, detail?: CloudJobDetail): JobResponse {
  const providerStatus = detail?.runtime_invocation?.status ?? row.status;
  const status = mapCloudStatus(row.status);
  return {
    id: row.job_id,
    job: {
      name: row.source_filename ?? row.job_id,
      source_filename: row.source_filename ?? null,
      source_content_type: row.source_content_type ?? null,
      compute_target: 'kenkui-cloud',
    },
    status,
    progress: status === 'completed' ? 1 : 0,
    current_chapter: providerStatus,
    eta_seconds: 0,
    error_message: row.error_message ?? '',
    output_path: status === 'completed' ? `${row.job_id}.m4b` : '',
    started_at: isoSeconds(row.created_at),
    completed_at: isoSeconds(row.completed_at),
    execution_provider: 'kenkui-cloud',
    remote_job_id: detail?.runtime_invocation?.invocation_id ?? '',
    provider_status: providerStatus,
  };
}

function summarizeCloudQueue(items: JobResponse[]): QueueResponse {
  const currentItem = items.find((item) => item.status === 'processing') ?? null;
  return {
    items,
    current_item: currentItem,
    pending_count: items.filter((item) => item.status === 'pending').length,
    completed_count: items.filter((item) => item.status === 'completed').length,
    failed_count: items.filter((item) => item.status === 'failed').length,
  };
}

function bundleForJob(req: JobCreateRequest, sourceFilename: string) {
  return {
    version: 1,
    source_filename: sourceFilename,
    job_config: {
      ...req,
      ebook_path: sourceFilename,
      output_path: null,
      tts_execution_mode: 'local',
      annotated_chapters_path: null,
      roster_cache_path: null,
      job_nlp_execution_mode: 'local',
      job_attribution_execution_mode: 'local',
    },
    app_config: {},
    nlp: {
      enabled: req.narration_mode === 'multi',
      extraction_provider: req.job_nlp_provider,
      extraction_model: req.job_nlp_model,
      discovery_method: req.job_character_discovery_method,
      attribution_provider: req.job_attribution_provider,
      attribution_model: req.job_attribution_model,
    },
  };
}

export async function fetchCloudQueue(): Promise<QueueResponse> {
  const response = await cloudRequest<{ jobs: CloudJobRow[] }>('list-jobs?limit=50');
  return summarizeCloudQueue(response.jobs.map((job) => mapCloudJob(job)));
}

export async function createCloudJob(req: JobCreateRequest): Promise<JobResponse> {
  const stat = await nativeCommands.fileStat(req.ebook_path);
  if (!CLOUD_SOURCE_CONTENT_TYPES.has(stat.contentType)) {
    throw new Error('Kengui Cloud currently accepts EPUB, PDF, and TXT source files.');
  }

  const job = await cloudRequest<CreateCloudJobResponse>('create-job', {
    method: 'POST',
    body: JSON.stringify({
      source_filename: stat.filename,
      source_content_type: stat.contentType,
      requested_runtime: 'modal',
    }),
  });

  const sourceUpload = await cloudRequest<SignUploadResponse>('sign-upload', {
    method: 'POST',
    body: JSON.stringify({
      job_id: job.job_id,
      artifact_type: 'source',
      filename: stat.filename,
      content_type: stat.contentType,
      byte_size: stat.byteSize,
    }),
  });
  await nativeCommands.signedUploadFile({
    path: stat.path,
    url: sourceUpload.upload_url,
    contentType: stat.contentType,
  });
  await cloudRequest('confirm-upload', {
    method: 'POST',
    body: JSON.stringify({ artifact_id: sourceUpload.artifact_id }),
  });

  const bundle = JSON.stringify(bundleForJob(req, stat.filename));
  const byteSize = new TextEncoder().encode(bundle).byteLength;
  const bundleUpload = await cloudRequest<SignUploadResponse>('sign-upload', {
    method: 'POST',
    body: JSON.stringify({
      job_id: job.job_id,
      artifact_type: 'input_bundle',
      filename: 'job.json',
      content_type: 'application/json',
      byte_size: byteSize,
    }),
  });
  await nativeCommands.signedUploadText({
    text: bundle,
    url: bundleUpload.upload_url,
    contentType: 'application/json',
  });
  await cloudRequest('confirm-upload', {
    method: 'POST',
    body: JSON.stringify({ artifact_id: bundleUpload.artifact_id }),
  });

  const submitted = await cloudRequest<SubmitCloudJobResponse>('submit-job', {
    method: 'POST',
    body: JSON.stringify({ job_id: job.job_id }),
  });
  return mapCloudJob({
    job_id: submitted.job_id,
    status: submitted.status,
    source_filename: stat.filename,
    source_content_type: stat.contentType,
  }, {
    job: {
      job_id: submitted.job_id,
      status: submitted.status,
      source_filename: stat.filename,
      source_content_type: stat.contentType,
    },
    artifacts: [],
    runtime_invocation: {
      invocation_id: submitted.invocation_id,
      status: submitted.invocation_status,
    },
  });
}

export async function cancelCloudJob(id: string): Promise<void> {
  await cloudRequest('cancel-job', {
    method: 'POST',
    body: JSON.stringify({ job_id: id }),
  });
}

export async function purgeCloudJob(id: string): Promise<void> {
  await cloudRequest('purge-job', {
    method: 'POST',
    body: JSON.stringify({ job_id: id }),
  });
}

export async function downloadCloudJob(id: string): Promise<void> {
  const detail = await cloudRequest<CloudJobDetail>(`get-job?job_id=${encodeURIComponent(id)}`);
  const artifact = detail.artifacts.find(
    (item) => item.artifact_type === 'final_output' && !item.purged_at
  );
  if (!artifact) throw new Error('Cloud job has no downloadable final output yet.');
  const outputPath = await saveM4bFile(`${id}.m4b`);
  if (!outputPath) return;
  const signed = await cloudRequest<SignDownloadResponse>('sign-download', {
    method: 'POST',
    body: JSON.stringify({ artifact_id: artifact.artifact_id }),
  });
  await nativeCommands.signedDownloadFile({
    url: signed.download_url,
    outputPath,
  });
}

export function cloudQueueSelected(): boolean {
  return useConnectionStore.getState().computeTarget === 'kenkui-cloud';
}
