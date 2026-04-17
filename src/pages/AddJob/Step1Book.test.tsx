import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import * as booksApi from '../../api/books';
import Step1Book from './Step1Book';

vi.mock('@tauri-apps/plugin-dialog');
vi.mock('../../api/books');

const mockBook = {
  book_hash: 'abc123',
  metadata: { title: 'Dune', author: 'Herbert' },
  chapters: [{ index: 0, title: 'Chapter 1', word_count: 1000, paragraph_count: 10, toc_index: 0, tags: {} }],
  total_chapters: 1,
  total_word_count: 1000,
};

describe('Step1Book', () => {
  it('calls file dialog on button click', async () => {
    vi.mocked(open).mockResolvedValue(null);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.any(Array) })
    );
  });

  it('shows book title after parse succeeds', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByText('Dune')).toBeInTheDocument());
  });

  it('enables Next button after successful parse', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled());
  });

  it('calls onNext with book data', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => screen.getByRole('button', { name: /next/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/path/to/book.epub', book: mockBook })
    );
  });
});
