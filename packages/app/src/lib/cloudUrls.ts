const FUNCTIONS_SUFFIX = '/functions/v1';

export function normalizeHttpUrl(value: string, label = 'URL'): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must start with http:// or https://.`);
  }
  return url.toString().replace(/\/$/, '');
}

export function normalizeSupabaseBaseUrl(value: string): string {
  const normalized = normalizeHttpUrl(value, 'Hosted URL');
  return normalized.endsWith(FUNCTIONS_SUFFIX)
    ? normalized.slice(0, -FUNCTIONS_SUFFIX.length)
    : normalized;
}

export function cloudFunctionsUrlForBase(value: string): string {
  return `${normalizeSupabaseBaseUrl(value)}${FUNCTIONS_SUFFIX}`;
}

export function isLocalhostUrl(value: string): boolean {
  try {
    const hostname = new URL(normalizeHttpUrl(value)).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}
