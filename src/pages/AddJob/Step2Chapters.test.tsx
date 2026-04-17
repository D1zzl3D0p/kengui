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
  chapters: [],
  total_chapters: 2,
  total_word_count: 5000,
};

const makeFilterResponse = (chapters: { index: number; title: string; word_count: number }[]): ChapterFilterResponse => ({
  included_indices: chapters.map((c) => c.index),
  chapter_count: chapters.length,
  estimated_word_count: chapters.reduce((sum, c) => sum + c.word_count, 0),
  chapters: chapters.map((c) => ({
    index: c.index,
    title: c.title,
    word_count: c.word_count,
    paragraph_count: 10,
    toc_index: c.index,
    tags: {},
  })),
});

describe('Step2Chapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders preset selector and initial filtered chapters on mount', async () => {
    mockFilterChapters.mockResolvedValue(
      makeFilterResponse([
        { index: 0, title: 'Chapter 1', word_count: 2500 },
        { index: 1, title: 'Chapter 2', word_count: 2500 },
      ])
    );

    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Chapter 1')).toBeInTheDocument();
      expect(screen.getByText('Chapter 2')).toBeInTheDocument();
    });

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(mockFilterChapters).toHaveBeenCalledWith('abc123', 'content-only');
  });

  it('changing preset re-fetches chapters', async () => {
    mockFilterChapters
      .mockResolvedValueOnce(
        makeFilterResponse([{ index: 0, title: 'Chapter 1', word_count: 2500 }])
      )
      .mockResolvedValueOnce(
        makeFilterResponse([
          { index: 0, title: 'Part One', word_count: 1000 },
          { index: 1, title: 'Chapter A', word_count: 3000 },
        ])
      );

    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'with-parts');

    await waitFor(() => {
      expect(mockFilterChapters).toHaveBeenCalledWith('abc123', 'with-parts');
      expect(screen.getByText('Part One')).toBeInTheDocument();
      expect(screen.getByText('Chapter A')).toBeInTheDocument();
    });
  });

  it('Next button calls onNext with selected preset', async () => {
    mockFilterChapters.mockResolvedValue(
      makeFilterResponse([{ index: 0, title: 'Chapter 1', word_count: 2500 }])
    );

    const onNext = vi.fn();
    render(<Step2Chapters book={mockBook} onBack={vi.fn()} onNext={onNext} />);

    await waitFor(() => {
      expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith({ chapterPreset: 'content-only' });
  });
});
