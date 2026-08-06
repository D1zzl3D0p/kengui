import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

async function freshKv() {
  vi.resetModules();
  return (await import('./secureStore')).secureKv;
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});
afterEach(() => vi.clearAllMocks());

describe('secureKv', () => {
  it('hydrates from the keychain blob and reads a key', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockImplementation((cmd: string) =>
      cmd === 'load_auth_session' ? Promise.resolve(JSON.stringify({ a: '1' })) : Promise.resolve());
    const kv = await freshKv();
    await expect(kv.getItem('a')).resolves.toBe('1');
    await expect(kv.getItem('missing')).resolves.toBeNull();
  });

  it('persists the whole map as JSON on setItem', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockResolvedValue(null);
    const kv = await freshKv();
    await kv.setItem('token', 'xyz');
    expect(invoke).toHaveBeenCalledWith('save_auth_session', { value: JSON.stringify({ token: 'xyz' }) });
  });

  it('clears the slot when the last key is removed', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockImplementation((cmd: string) =>
      cmd === 'load_auth_session' ? Promise.resolve(JSON.stringify({ token: 'xyz' })) : Promise.resolve());
    const kv = await freshKv();
    await kv.removeItem('token');
    expect(invoke).toHaveBeenCalledWith('clear_auth_session');
  });

  it('falls back to localStorage when invoke rejects', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invoke.mockRejectedValue(new Error('no tauri'));
    const kv = await freshKv();
    await kv.setItem('token', 'abc');
    expect(localStorage.getItem('kengui.supabase.session')).toBe(JSON.stringify({ token: 'abc' }));
    const kv2 = await freshKv();
    await expect(kv2.getItem('token')).resolves.toBe('abc');
  });

  it('uses browser storage directly outside Tauri', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const kv = await freshKv();

    await kv.setItem('pkce-verifier', 'verifier');

    expect(invoke).not.toHaveBeenCalled();
    expect(localStorage.getItem('kengui.supabase.session')).toBe(
      JSON.stringify({ 'pkce-verifier': 'verifier' })
    );
  });
});
