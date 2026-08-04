import type { SupabaseOAuthProvider } from '../../auth/supabase';

export const HOSTED_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_HOSTED === 'true';
export const LOCAL_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_LOCAL !== 'false';
export const HOSTED_RUNTIME_URL =
  import.meta.env.VITE_KENGUI_HOSTED_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  'https://api.kengui.app';
export const CLOUD_COMPUTE_ENABLED =
  import.meta.env.VITE_KENGUI_ENABLE_CLOUD === 'true' || HOSTED_RUNTIME_ENABLED;
export const HIGH_LOCAL_WORKER_WARNING_THRESHOLD = 4;
export const CLOUD_AUTH_PROVIDERS: { provider: SupabaseOAuthProvider; label: string }[] = [
  { provider: 'google', label: 'Google' },
  { provider: 'github', label: 'GitHub' },
  { provider: 'apple', label: 'Apple' },
];
