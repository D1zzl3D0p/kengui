import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmptySeries, fetchSeries, fetchSeriesDetail } from './series';
import * as client from './client';

const mockApiRequest = vi.spyOn(client, 'apiRequest');

beforeEach(() => {
  mockApiRequest.mockReset();
});

describe('fetchSeries', () => {
  it('calls GET /series', async () => {
    mockApiRequest.mockResolvedValueOnce({ series: [], total: 0 });
    await fetchSeries();
    expect(mockApiRequest).toHaveBeenCalledWith('/series');
  });
});

describe('fetchSeriesDetail', () => {
  it('calls GET /series/{slug}', async () => {
    mockApiRequest.mockResolvedValueOnce({ slug: 'hp', name: 'Harry Potter', characters: [] });
    await fetchSeriesDetail('hp');
    expect(mockApiRequest).toHaveBeenCalledWith('/series/hp');
  });
});

describe('createEmptySeries', () => {
  it('calls POST /series/empty with the series name', async () => {
    mockApiRequest.mockResolvedValueOnce({ slug: 'the-expanse', name: 'The Expanse' });
    await createEmptySeries('The Expanse');
    expect(mockApiRequest).toHaveBeenCalledWith('/series/empty', {
      method: 'POST',
      body: JSON.stringify({ name: 'The Expanse' }),
    });
  });
});
