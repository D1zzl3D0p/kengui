import { describe, expect, it } from 'vitest';
import {
  buildCleanupUsersSql,
  classifyInvalidCodeProbe,
  classifyWrongVerifierProbe,
  databaseContainerName,
  downstreamListJobsUrl,
  isLocalSupabaseUrl,
  parseProjectId,
  redactSecret,
  requestJson,
  run,
  runWithCleanup,
  safeLocalSupabaseUrlLabel,
  validateLocalSupabaseOrigin,
} from './selftest-local-supabase-auth.mjs';

it('reports secret presence without revealing any key characters', () => {
  const key = 'short-public-key';
  const output = redactSecret(key);
  expect(output).toBe('<configured>');
  expect(output).not.toContain(key);
  expect(redactSecret('')).toBe('<missing>');
});

it('accepts only loopback HTTP Supabase URLs', () => {
  expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
  expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
  expect(isLocalSupabaseUrl('http://[::1]:54321')).toBe(true);
  expect(isLocalSupabaseUrl('https://project.supabase.co')).toBe(false);
  expect(isLocalSupabaseUrl('https://localhost:54321')).toBe(false);
  expect(isLocalSupabaseUrl('not a url')).toBe(false);
});

describe('local Supabase base URL validation', () => {
  it('canonicalizes a valid root URL to its origin', () => {
    expect(validateLocalSupabaseOrigin('http://localhost:54321'))
      .toBe('http://localhost:54321');
    expect(validateLocalSupabaseOrigin('http://127.0.0.1:54321/'))
      .toBe('http://127.0.0.1:54321');
  });

  it.each([
    'http://user@localhost:54321',
    'http://user:password@localhost:54321',
    'http://localhost:54321/auth/v1',
    'http://localhost:54321?unsafe=value',
    'http://localhost:54321/#unsafe',
  ])('rejects credentials, query, fragment, or non-root path in %j', (value) => {
    expect(validateLocalSupabaseOrigin(value)).toBeNull();
    expect(isLocalSupabaseUrl(value)).toBe(false);
  });

  it('produces a safe logging label without reflecting an invalid configured URL', () => {
    const unsafe = 'http://user:password@localhost:54321/private?secret=value#fragment';
    const label = safeLocalSupabaseUrlLabel(unsafe);
    expect(label).toBe('<invalid>');
    expect(label).not.toContain(unsafe);
    expect(safeLocalSupabaseUrlLabel('')).toBe('<missing>');
    expect(safeLocalSupabaseUrlLabel('http://localhost:54321/')).toBe('http://localhost:54321');
  });
});

describe('invalid-code probe classification', () => {
  it('positively identifies only an Invalid API key response as a key/header failure', () => {
    expect(classifyInvalidCodeProbe({
      status: 401,
      ok: false,
      json: { message: 'Invalid API key' },
    })).toBe('key/header failure');
    expect(classifyInvalidCodeProbe({
      status: 401,
      ok: false,
      json: { message: 'some other unauthorized response' },
    })).toBe('inconclusive failure');
  });

  it('accepts only recognized GoTrue flow-state failures as proof key validation passed', () => {
    expect(classifyInvalidCodeProbe({
      status: 400,
      ok: false,
      json: { error: 'invalid_grant', error_description: 'flow state not found' },
    })).toBe('passed API-key validation');
    expect(classifyInvalidCodeProbe({
      status: 400,
      ok: false,
      json: { code: 'flow_state_not_found', msg: 'Flow state not found' },
    })).toBe('passed API-key validation');
    expect(classifyInvalidCodeProbe({
      status: 404,
      ok: false,
      json: { error_code: 'flow_state_not_found', msg: 'Invalid flow state, no valid flow state found' },
    })).toBe('passed API-key validation');
    expect(classifyInvalidCodeProbe({ status: 400, ok: false, json: { error: 'bad request' } }))
      .toBe('inconclusive failure');
    expect(classifyInvalidCodeProbe({ status: 422, ok: false, json: {} }))
      .toBe('inconclusive failure');
    expect(classifyInvalidCodeProbe({
      status: 400,
      ok: false,
      json: { error: 'invalid_grant' },
      text: 'flow state not found',
    })).toBe('inconclusive failure');
    expect(classifyInvalidCodeProbe({ status: 200, ok: true, json: {} }))
      .toBe('unexpected success');
  });
});

describe('wrong-verifier probe classification', () => {
  it('accepts only recognized GoTrue bad-code-verifier responses', () => {
    expect(classifyWrongVerifierProbe({
      status: 400,
      ok: false,
      json: { error_code: 'bad_code_verifier', message: 'not logged' },
    })).toBe('recognized bad verifier');
    expect(classifyWrongVerifierProbe({
      status: 400,
      ok: false,
      json: { code: 'bad_code_verifier' },
    })).toBe('recognized bad verifier');
    expect(classifyWrongVerifierProbe({
      status: 400,
      ok: false,
      json: { error: 'invalid_grant', error_description: 'Invalid code verifier' },
    })).toBe('recognized bad verifier');
  });

  it.each([
    { status: 500, ok: false, json: { code: 'bad_code_verifier' } },
    { status: 401, ok: false, json: { message: 'Invalid API key' } },
    { status: 400, ok: false, json: { code: 'flow_state_not_found' } },
    { status: 400, ok: false, json: { error: 'invalid_grant', error_description: 'unrelated' } },
    { status: 400, ok: false, json: { message: 'bad request' } },
    { status: 200, ok: true, json: {} },
  ])('rejects an inconclusive response %#', (result) => {
    expect(classifyWrongVerifierProbe(result)).toBe('inconclusive failure');
  });
});

it('constructs a credentialed downstream URL only for the exact API origin and functions path', () => {
  const baseUrl = 'http://127.0.0.1:54321';
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54321/functions/v1'))
    .toBe('http://127.0.0.1:54321/functions/v1/list-jobs?limit=1');
  expect(downstreamListJobsUrl(baseUrl, 'https://functions.example.test/functions/v1')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54322/functions/v1')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://user@127.0.0.1:54321/functions/v1')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54321/functions/v1?x=1')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54321/functions/v1#x')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54321/functions/v2')).toBeNull();
  expect(downstreamListJobsUrl(baseUrl, 'http://127.0.0.1:54321/other/functions/v1')).toBeNull();
});

describe('bounded operations and cleanup orchestration', () => {
  it('configures an explicit timeout for fetch', async () => {
    let options;
    const fetchImpl = async (_url, suppliedOptions) => {
      options = suppliedOptions;
      return { status: 200, ok: true, text: async () => '{}' };
    };
    await requestJson('http://localhost:54321/auth/v1/user', {}, fetchImpl);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('configures an explicit timeout for spawned commands and emits a generic timeout error', () => {
    let options;
    const spawnImpl = (_command, _args, suppliedOptions) => {
      options = suppliedOptions;
      return { status: 0, stdout: '', stderr: '' };
    };
    run('supabase', ['status'], {}, spawnImpl);
    expect(options.timeout).toBeGreaterThan(0);

    const timedOut = () => run('docker', ['exec'], {}, () => ({
      status: null,
      stdout: '',
      stderr: 'unsafe details',
      error: Object.assign(new Error('unsafe details'), { code: 'ETIMEDOUT' }),
    }));
    expect(timedOut).toThrow('Local self-test command timed out.');
  });

  it('runs cleanup after an earlier failure and fails closed when cleanup fails', async () => {
    const events = [];
    await expect(runWithCleanup(
      async () => { events.push('work'); throw new Error('work failed'); },
      async () => { events.push('cleanup'); },
    )).rejects.toThrow('work failed');
    expect(events).toEqual(['work', 'cleanup']);

    await expect(runWithCleanup(
      async () => { events.push('successful work'); },
      async () => { events.push('failed cleanup'); throw new Error('unsafe database detail'); },
    )).rejects.toThrow('Local self-test user cleanup failed.');
  });
});

describe('local database target derivation', () => {
  it('derives the database container from the selected worktree project id', () => {
    expect(parseProjectId('project_id = "kenkui-cloud-local"\n[api]\nenabled = true\n'))
      .toBe('kenkui-cloud-local');
    expect(databaseContainerName('kenkui-cloud-local')).toBe('supabase_db_kenkui-cloud-local');
  });

  it.each([
    'project_id = "../../foreign"',
    'project_id = "unsafe; docker rm"',
    'project_id = "UPPERCASE"',
    'project_id = ""',
    '[api]\nenabled = true',
  ])('rejects an absent or unsafe project id from %j', (config) => {
    expect(() => parseProjectId(config)).toThrow('safe project_id');
  });
});

it('builds cleanup SQL from strictly validated fallback emails and user ids', () => {
  expect(buildCleanupUsersSql({
    userIds: ['123e4567-e89b-42d3-a456-426614174000'],
    emails: ['kengui-auth-user-123-abcdef@example.test'],
  })).toBe(
    "delete from auth.users where id in ('123e4567-e89b-42d3-a456-426614174000') " +
    "or email in ('kengui-auth-user-123-abcdef@example.test');"
  );
  expect(() => buildCleanupUsersSql({ userIds: ["x'); drop table auth.users;--"], emails: [] }))
    .toThrow('cleanup identity');
  expect(() => buildCleanupUsersSql({ userIds: [], emails: ["x'@example.test"] }))
    .toThrow('cleanup identity');
});
