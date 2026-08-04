import { describe, it, expect } from 'vitest';
import { isCompleteWizardState } from './index';
import type { WizardState } from './index';

const fullState: WizardState = {
  filePath: '/books/book.epub',
  book: {
    book_id: 'abc',
    title: 'Test Book',
    author: 'Author',
    chapters: [],
    characters: [],
    cover_path: null,
    metadata: {},
  } as unknown as WizardState['book'],
  chapterPreset: 'content-only',
  chapterSelection: { preset: 'content-only', custom_ranges: [] } as unknown as WizardState['chapterSelection'],
  narrationMode: 'single',
  voice: 'en_US-joe-medium',
};

describe('isCompleteWizardState', () => {
  it('returns true for a complete state', () => {
    expect(isCompleteWizardState(fullState)).toBe(true);
  });

  it('returns false when filePath is missing', () => {
    const { filePath: _fp, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false when book is missing', () => {
    const { book: _b, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false when chapterPreset is missing', () => {
    const { chapterPreset: _cp, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false when chapterSelection is missing', () => {
    const { chapterSelection: _cs, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false when narrationMode is missing', () => {
    const { narrationMode: _nm, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false when voice is missing', () => {
    const { voice: _v, ...rest } = fullState;
    expect(isCompleteWizardState(rest)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isCompleteWizardState({})).toBe(false);
  });
});
