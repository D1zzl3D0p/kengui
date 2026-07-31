import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn((..._a: unknown[]) => ({ auth: {} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
vi.mock('../platform', () => ({ secureKv: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }));

async function fresh() {
  vi.resetModules();
  return import('./supabaseClient');
}

beforeEach(() => {
  createClient.mockClear();
  vi.unstubAllEnvs();
});

describe('supabaseClient', () => {
  it('reports configured only when URL and key are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const m = await fresh();
    expect(m.supabaseConfigured()).toBe(true);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m2 = await fresh();
    expect(m2.supabaseConfigured()).toBe(false);
  });

  it('throws when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const m = await fresh();
    expect(() => m.getSupabaseClient()).toThrow('Supabase URL is not configured.');
  });

  it('creates a memoized PKCE client with secureKv storage', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://p.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    const m = await fresh();
    const c1 = m.getSupabaseClient();
    const c2 = m.getSupabaseClient();
    expect(c1).toBe(c2);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://p.supabase.co', 'anon', expect.objectContaining({
      auth: expect.objectContaining({ flowType: 'pkce', detectSessionInUrl: false, persistSession: true }),
    }));
  });
});
