import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import * as booksApi from '../../api/books';
import { pickBookFile } from '../../platform';
import Step1Book from './Step1Book';
import { ApiError } from '../../api/client';

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

  it('surfaces parse error detail from JSON error message', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.txt');
    vi.mocked(booksApi.parseBook).mockRejectedValue(
      new ApiError(422, '{"detail":"Unsupported format: .txt"}')
    );

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Unsupported format: \.txt/)).toBeInTheDocument();
    });
  });

  it('surfaces plain-string rejections from Tauri commands', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockRejectedValue(
      'Signed upload request failed: error sending request'
    );

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Signed upload request failed/)).toBeInTheDocument();
    });
  });

  it('falls back to generic message when error has no message', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockRejectedValue(new Error());

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to parse ebook/)).toBeInTheDocument();
    });
  });

  it('extracts error message when not JSON', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockRejectedValue(new ApiError(400, 'File is corrupted'));

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/File is corrupted/)).toBeInTheDocument();
    });
  });

  it('uses message field when detail is not present', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    vi.mocked(booksApi.parseBook).mockRejectedValue(
      new ApiError(400, '{"message":"Invalid book format","error":"parse_failed"}')
    );

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid book format/)).toBeInTheDocument();
    });
  });

  it('shows generic message for very long error text', async () => {
    vi.mocked(pickBookFile).mockResolvedValue('/path/to/book.epub');
    const longText = 'a'.repeat(500);
    vi.mocked(booksApi.parseBook).mockRejectedValue(new ApiError(400, longText));

    render(<Step1Book onNext={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /choose file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to parse ebook/)).toBeInTheDocument();
    });
  });
});
