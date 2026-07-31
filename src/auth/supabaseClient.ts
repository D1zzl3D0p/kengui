import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureKv } from '../platform';

let client: SupabaseClient | null = null;

function envUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  return url ? url.replace(/\/$/, '') : null;
}

export function supabaseConfigured(): boolean {
  return Boolean(envUrl() && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function supabaseAnonKey(): string {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Supabase anon key is not configured.');
  return key;
}

export function getSupabaseClient(): SupabaseClient {
  const url = envUrl();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL is not configured.');
  if (!client) {
    client = createClient(url, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
        storage: secureKv,
      },
    });
  }
  return client;
}
