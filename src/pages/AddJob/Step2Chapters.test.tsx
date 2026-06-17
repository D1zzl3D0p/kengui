import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Step2Chapters from './Step2Chapters';
import type { BookParseResponse, ChapterFilterResponse } from '../../api/books';

vi.mock('../../api/books', () => ({
  filterChapters: vi.fn(),
  parseBook: vi.fn(),
}));

import { filterChapters } from '../../api/books';
const mockFilterChapters = filterChapters as ReturnType<typeof vi.fn>;

const mockBook: BookParseResponse = {
  book_hash: 'abc123',
  metadata: { title: 'Test Book', author: 'Test Author' },
  chapters: [
    { index: 0, title: 'Front Matter', word_count: 500, paragraph_count: 10, toc_index: 0, tags: {} },
    { index: 1, title: 'Chapter 1', word_count: 2500, paragraph_count: 10, toc_index: 1, tags: {} },
    { index: 2, title: 'Chapter 2', word_count: 3000, paragraph_count: 10, toc_index: 2, tags: {} },
  ],
  total_chapters: 3,
  total_word_count: 6000,
};

const makeFilterResponse = (includedIndices: number[]): ChapterFilterResponse => ({
  included_indices: includedIndices,
  chapter_count: includedIndices.length,
  estimated_word_count: includedIndices.length * 1000,
  chapters: includedIndices.map((index) => ({
    index,
    title: `Chapter ${index + 1}`,
    word_count: 1000,
    paragraph_count: 10,
    toc_index: index,
    tags: {},
  })),
});

describe('Step2Chapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full chapter list and applies the initial preset selection', async () => {
    mockFilterChapters.mockResolvedValue(makeFilterResponse([1, 2]));

    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByText('Front Matter')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Front Matter')).not.toBeChecked();
      expect(screen.getByLabelText('Chapter 1')).toBeChecked();
      expect(screen.getByLabelText('Chapter 2')).toBeChecked();
    });

    expect(mockFilterChapters).toHaveBeenCalledWith('abc123', 'content-only');
  });

  it('changing the preset reapplies the bulk chapter selection', async () => {
    mockFilterChapters
      .mockResolvedValueOnce(makeFilterResponse([1]))
      .mockResolvedValueOnce(makeFilterResponse([0, 1, 2]));

    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Chapter 1')).toBeChecked();
      expect(screen.getByLabelText('Chapter 2')).not.toBeChecked();
    });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'none');

    await waitFor(() => {
      expect(mockFilterChapters).toHaveBeenCalledWith('abc123', 'none');
      expect(screen.getByLabelText('Front Matter')).toBeChecked();
      expect(screen.getByLabelText('Chapter 1')).toBeChecked();
      expect(screen.getByLabelText('Chapter 2')).toBeChecked();
    });
  });

  it('manual chapter edits are submitted as a custom selection', async () => {
    mockFilterChapters.mockResolvedValue(makeFilterResponse([1, 2]));

    const onNext = vi.fn();
    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Front Matter')).not.toBeChecked();
    });

    await userEvent.click(screen.getByLabelText('Front Matter'));

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith({
      chapterPreset: 'custom',
      chapterSelection: {
        preset: 'custom',
        included: [0, 1, 2],
        excluded: [],
      },
    });
  });
});
