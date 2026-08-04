import { describe, expect, it } from 'vitest';
import {
  cloudFunctionsUrlForBase,
  isLocalhostUrl,
  normalizeSupabaseBaseUrl,
} from './cloudUrls';

describe('cloud URL helpers', () => {
  it('normalizes a Supabase base URL', () => {
    expect(normalizeSupabaseBaseUrl('http://127.0.0.1:54321/')).toBe(
      'http://127.0.0.1:54321'
    );
  });

  it('accepts an Edge Functions URL as the hosted connection URL', () => {
    expect(
      normalizeSupabaseBaseUrl('http://127.0.0.1:54321/functions/v1')
    ).toBe('http://127.0.0.1:54321');
  });

  it('derives the Edge Functions URL from the hosted base', () => {
    expect(cloudFunctionsUrlForBase('http://127.0.0.1:54321')).toBe(
      'http://127.0.0.1:54321/functions/v1'
    );
  });

  it('detects local hosted control planes', () => {
    expect(isLocalhostUrl('http://localhost:54321')).toBe(true);
    expect(isLocalhostUrl('https://api.kengui.app')).toBe(false);
  });
});
