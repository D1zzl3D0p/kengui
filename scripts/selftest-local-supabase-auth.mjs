#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function redactSecret(value) {
  if (!value) return '<missing>';
  return '<configured>';
}

export function validateLocalSupabaseOrigin(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const isLoopback = hostname === 'localhost' || hostname === '::1' ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname);
    if (url.protocol !== 'http:' || !isLoopback || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isLocalSupabaseUrl(value) {
  return validateLocalSupabaseOrigin(value) !== null;
}

export function safeLocalSupabaseUrlLabel(value) {
  if (!value) return '<missing>';
  return validateLocalSupabaseOrigin(value) ?? '<invalid>';
}

export function classifyInvalidCodeProbe(result) {
  if (result.ok) return 'unexpected success';
  const data = result.json && typeof result.json === 'object' ? result.json : {};
  const safeString = (field) => typeof data[field] === 'string' ? data[field].trim() : '';
  const message = safeString('message') || safeString('msg');
  if (result.status === 401 && message.toLowerCase() === 'invalid api key') {
    return 'key/header failure';
  }

  const code = safeString('error_code') || safeString('code');
  const error = safeString('error');
  const description = safeString('error_description') || safeString('msg') || safeString('message');
  const knownCode = code === 'flow_state_not_found' || code === 'flow_state_expired';
  const knownInvalidGrant = error === 'invalid_grant' && (
    description.toLowerCase() === 'flow state not found' ||
    description.toLowerCase() === 'flow state has expired'
  );
  if ((result.status === 400 || result.status === 404) && (knownCode || knownInvalidGrant)) {
    return 'passed API-key validation';
  }
  return 'inconclusive failure';
}

export function classifyWrongVerifierProbe(result) {
  if (result.ok || result.status !== 400) return 'inconclusive failure';
  const data = result.json && typeof result.json === 'object' ? result.json : {};
  const safeString = (field) => typeof data[field] === 'string' ? data[field].trim() : '';
  const code = safeString('error_code') || safeString('code');
  if (code === 'bad_code_verifier') return 'recognized bad verifier';

  const error = safeString('error');
  const description = safeString('error_description');
  if (error === 'invalid_grant' && description.toLowerCase() === 'invalid code verifier') {
    return 'recognized bad verifier';
  }
  return 'inconclusive failure';
}

export function downstreamListJobsUrl(baseUrl, functionsUrl) {
  const baseOrigin = validateLocalSupabaseOrigin(baseUrl);
  if (!baseOrigin) return null;
  try {
    const url = new URL(functionsUrl);
    if (url.origin !== baseOrigin || url.username || url.password || url.search || url.hash ||
        url.pathname !== '/functions/v1') {
      return null;
    }
    return `${baseOrigin}/functions/v1/list-jobs?limit=1`;
  } catch {
    return null;
  }
}

const SAFE_PROJECT_ID = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TEMP_EMAIL = /^kengui-[a-z0-9-]+-[0-9]+-[0-9a-f]{6}@example\.test$/;

export function parseProjectId(config) {
  const matches = [...config.matchAll(/^\s*project_id\s*=\s*"([^"]*)"\s*$/gm)];
  const projectId = matches.length === 1 ? matches[0][1] : '';
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new Error('Selected Supabase config must contain one safe project_id.');
  }
  return projectId;
}

export function databaseContainerName(projectId) {
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new Error('Refusing an unsafe Supabase project_id.');
  }
  return `supabase_db_${projectId}`;
}

export function buildCleanupUsersSql({ userIds, emails }) {
  if (userIds.some((id) => !SAFE_UUID.test(id)) || emails.some((email) => !SAFE_TEMP_EMAIL.test(email))) {
    throw new Error('Refusing an unsafe cleanup identity.');
  }
  const clauses = [];
  if (userIds.length > 0) clauses.push(`id in (${userIds.map((id) => `'${id}'`).join(', ')})`);
  if (emails.length > 0) clauses.push(`email in (${emails.map((email) => `'${email}'`).join(', ')})`);
  return clauses.length > 0 ? `delete from auth.users where ${clauses.join(' or ')};` : null;
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function pkcePair() {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

const FETCH_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 30_000;

export async function requestJson(url, { method = 'GET', key, token, body } = {}, fetchImpl = fetch) {
  const headers = {};
  if (key) headers.apikey = key;
  if (token || key) headers.Authorization = `Bearer ${token ?? key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let response;
  let text;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    text = await response.text();
  } catch (error) {
    if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Local self-test request timed out.');
    }
    throw error;
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep text only.
  }
  return { status: response.status, ok: response.ok, json, text };
}

export function run(command, args, options = {}, spawnImpl = spawnSync) {
  const result = spawnImpl(command, args, {
    encoding: 'utf8',
    ...options,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error('Local self-test command timed out.');
  }
  if (result.error) throw result.error;
  return result;
}

export async function runWithCleanup(work, cleanup) {
  try {
    return await work();
  } finally {
    try {
      await cleanup();
    } catch {
      throw new Error('Local self-test user cleanup failed.');
    }
  }
}

function psql(containerName, sql) {
  const result = run('docker', [
    'exec',
    '-i',
    containerName,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-q',
    '-At',
  ], { input: sql });
  if (result.status !== 0) {
    throw new Error('Local database setup failed; inspect the Supabase database logs.');
  }
  return result.stdout.trim();
}

function temporaryUserEmail(label) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Unsafe temporary user label.');
  return `kengui-${label}-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`;
}

async function createTempUser(baseUrl, key, email) {
  const signup = await requestJson(`${baseUrl}/auth/v1/signup`, {
    method: 'POST',
    key,
    body: { email, password: 'TestPassword123!' },
  });
  if (!signup.ok || !SAFE_UUID.test(signup.json?.user?.id ?? '') || !signup.json?.access_token) {
    throw new Error(`Temporary local user signup failed with status ${signup.status}.`);
  }
  return { email, userId: signup.json.user.id, accessToken: signup.json.access_token };
}

function insertCompletedFlowState(containerName, { userId, authCode, challenge }) {
  const flowId = randomUUID();
  if (!SAFE_UUID.test(flowId) || !SAFE_UUID.test(userId) || !SAFE_UUID.test(authCode) ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    throw new Error('Refusing unsafe synthetic flow-state values.');
  }
  psql(containerName, `
insert into auth.flow_state (
 id, user_id, auth_code, code_challenge_method, code_challenge, provider_type,
 provider_access_token, provider_refresh_token,
 created_at, updated_at, authentication_method, auth_code_issued_at, email_optional
) values (
 '${flowId}', '${userId}', '${authCode}', 's256', '${challenge}', 'github',
 'selftest-provider-access', 'selftest-provider-refresh',
 now(), now(), 'oauth', now(), false
);
`);
}

async function exchangePkce(baseUrl, key, authCode, verifier) {
  return requestJson(`${baseUrl}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    key,
    body: { auth_code: authCode, code_verifier: verifier },
  });
}

async function main() {
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const env = parseEnv(resolve(repoRoot, '.env.local'));
  const configuredBaseUrl = env.VITE_SUPABASE_URL || env.VITE_KENGUI_HOSTED_URL || '';
  const baseUrl = validateLocalSupabaseOrigin(configuredBaseUrl);
  const key = env.VITE_SUPABASE_ANON_KEY || '';

  console.log('Kengui local Supabase auth self-test');
  console.log(`baseUrl=${safeLocalSupabaseUrlLabel(configuredBaseUrl)}`);
  console.log(`VITE_SUPABASE_ANON_KEY=${redactSecret(key)}`);
  if (!configuredBaseUrl || !key) {
    throw new Error('Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in .env.local');
  }
  if (!baseUrl) {
    throw new Error('Refusing to create self-test users: VITE_SUPABASE_URL must be a root loopback HTTP origin without credentials, query, or fragment.');
  }

  const functionsUrl = env.VITE_KENKUI_CLOUD_FUNCTIONS_URL || `${baseUrl}/functions/v1`;
  const cloudRepo = process.env.KENKUI_CLOUD_REPO || resolve(repoRoot, '../kenkui-cloud');
  const cloudWorkdir = resolve(cloudRepo, 'services/control-plane');
  const projectId = parseProjectId(readFileSync(resolve(cloudWorkdir, 'supabase/config.toml'), 'utf8'));
  const containerName = databaseContainerName(projectId);

  const statusResult = run('supabase', ['status', '--workdir', cloudWorkdir, '--output', 'json']);
  let status;
  try {
    status = statusResult.status === 0 ? JSON.parse(statusResult.stdout) : null;
  } catch {
    status = null;
  }
  if (!status) {
    throw new Error('Supabase CLI status JSON is unavailable; start the local stack before this self-test.');
  }
  const matchesPublishable = Boolean(status.PUBLISHABLE_KEY) && status.PUBLISHABLE_KEY === key;
  const matchesAnon = Boolean(status.ANON_KEY) && status.ANON_KEY === key;
  const matchesApiUrl = typeof status.API_URL === 'string' &&
    validateLocalSupabaseOrigin(status.API_URL) === baseUrl;
  console.log(`Configured URL matches CLI API URL=${matchesApiUrl}`);
  console.log(`Configured key matches CLI PUBLISHABLE_KEY=${matchesPublishable}`);
  console.log(`Configured key matches CLI ANON_KEY=${matchesAnon}`);
  if (!matchesApiUrl || (!matchesPublishable && !matchesAnon)) {
    throw new Error('Configured Supabase URL/key identity does not match the running local CLI stack.');
  }

  const invalid = await exchangePkce(baseUrl, key, 'intentionally-invalid-code', 'intentionally-invalid-verifier');
  const invalidClassification = classifyInvalidCodeProbe(invalid);
  console.log(`invalid-code token probe status=${invalid.status} boundary=${invalidClassification}`);
  if (invalidClassification === 'key/header failure') {
    throw new Error('Token endpoint returned 401 for invalid code probe; key/header configuration is invalid.');
  }
  if (invalidClassification === 'unexpected success') {
    throw new Error('Invalid synthetic PKCE code unexpectedly succeeded.');
  }
  if (invalidClassification === 'inconclusive failure') {
    throw new Error('Invalid synthetic PKCE code probe was inconclusive.');
  }

  const localUserIds = [];
  const localUserEmails = [];
  let downstreamOutcome;
  await runWithCleanup(async () => {
    const userEmail = temporaryUserEmail('auth-user');
    localUserEmails.push(userEmail);
    const user = await createTempUser(baseUrl, key, userEmail);
    localUserIds.push(user.userId);
    const userResponse = await requestJson(`${baseUrl}/auth/v1/user`, { key, token: user.accessToken });
    console.log(`direct /auth/v1/user status=${userResponse.status} hasUser=${Boolean(userResponse.json?.id)}`);
    if (!userResponse.ok || !userResponse.json?.id) {
      throw new Error(`Direct Supabase user validation failed with status ${userResponse.status}.`);
    }

    const wrongEmail = temporaryUserEmail('pkce-wrong');
    localUserEmails.push(wrongEmail);
    const wrongUser = await createTempUser(baseUrl, key, wrongEmail);
    localUserIds.push(wrongUser.userId);
    const wrongPair = pkcePair();
    const wrongAuthCode = randomUUID();
    insertCompletedFlowState(containerName, { userId: wrongUser.userId, authCode: wrongAuthCode, challenge: wrongPair.challenge });
    const wrongExchange = await exchangePkce(baseUrl, key, wrongAuthCode, `${wrongPair.verifier}x`);
    const wrongClassification = classifyWrongVerifierProbe(wrongExchange);
    console.log(`synthetic PKCE wrong-verifier status=${wrongExchange.status} boundary=${wrongClassification}`);
    if (wrongClassification !== 'recognized bad verifier') {
      throw new Error('Wrong PKCE verifier probe was inconclusive.');
    }

    const goodEmail = temporaryUserEmail('pkce-good');
    localUserEmails.push(goodEmail);
    const goodUser = await createTempUser(baseUrl, key, goodEmail);
    localUserIds.push(goodUser.userId);
    const goodPair = pkcePair();
    const goodAuthCode = randomUUID();
    insertCompletedFlowState(containerName, { userId: goodUser.userId, authCode: goodAuthCode, challenge: goodPair.challenge });
    const goodExchange = await exchangePkce(baseUrl, key, goodAuthCode, goodPair.verifier);
    console.log(`synthetic PKCE correct-verifier status=${goodExchange.status} hasAccessToken=${Boolean(goodExchange.json?.access_token)}`);
    if (!goodExchange.ok || !goodExchange.json?.access_token) {
      throw new Error(`Correct PKCE verifier exchange failed with status ${goodExchange.status}.`);
    }

    const listJobsUrl = downstreamListJobsUrl(baseUrl, functionsUrl);
    if (!listJobsUrl) {
      downstreamOutcome = { kind: 'skip' };
    } else try {
      const listJobs = await requestJson(listJobsUrl, {
        key,
        token: goodExchange.json.access_token,
      });
      downstreamOutcome = listJobs.ok
        ? { kind: 'passed', status: listJobs.status }
        : { kind: 'failed', status: listJobs.status };
    } catch {
      downstreamOutcome = { kind: 'request-failed' };
    }
  }, async () => {
    const cleanupSql = buildCleanupUsersSql({ userIds: localUserIds, emails: localUserEmails });
    if (cleanupSql) psql(containerName, cleanupSql);
  });
  console.log('PASS local Supabase auth preflight');
  if (downstreamOutcome?.kind === 'skip') {
    console.warn('SKIP downstream Edge list-jobs: functions URL does not exactly match the local API origin and /functions/v1 path; credentials were not sent.');
  } else if (downstreamOutcome?.kind === 'passed') {
    console.log(`PASS downstream Edge list-jobs status=${downstreamOutcome.status}`);
  } else if (downstreamOutcome?.kind === 'failed') {
    console.warn(`DOWNSTREAM Edge list-jobs failed separately with status=${downstreamOutcome.status}; auth preflight passed.`);
  } else if (downstreamOutcome?.kind === 'request-failed') {
    console.warn('DOWNSTREAM Edge list-jobs request failed separately; auth preflight passed.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
