import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import * as booksApi from '../../api/books';
import { pickBookFile } from '../../platform';
import Step1Book from './Step1Book';

vi.mock('../../platform', () => ({
  pickBookFile: vi.fn(),
}));
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
    vi.mocked(pickBookFile).mockResolvedValue(null);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    expect(pickBookFile).toHaveBeenCalled();
  });

  it('shows book title after parse succeeds', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByText('Dune')).toBeInTheDocument());
  });

  it('enables Next button after successful parse', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue(mockBook);
    const onNext = vi.fn();
    render(<Step1Book onNext={onNext} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled());
  });

  it('calls onNext with book data', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
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

  it('renders the parsed book cover when metadata includes cover_data_url', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockResolvedValue({
      ...mockBook,
      metadata: {
        ...mockBook.metadata,
        cover_data_url: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    const cover = await screen.findByRole('img', { name: /cover for dune/i });
    expect(cover).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
  });
});
