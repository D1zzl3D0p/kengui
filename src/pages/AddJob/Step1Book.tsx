import { useState } from 'react';
import { BookOpen, Upload } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { parseBook } from '../../api/books';
import { pickBookFile } from '../../platform';
import type { BookParseResponse } from '../../api/books';

interface Step1Data {
  filePath: string;
  book: BookParseResponse;
}

interface Props {
  onNext: (data: Step1Data) => void;
}

function extractDetail(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const value = parsed.detail ?? parsed.message;
    if (typeof value === 'string' && value) return value;
  } catch {
    // not JSON
  }
  return text.length > 0 && text.length < 300 ? text : null;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function bookCoverSrc(book: BookParseResponse): string | null {
  return (
    metadataString(book.metadata, 'cover_data_url') ??
    metadataString(book.metadata, 'cover_url') ??
    metadataString(book.metadata, 'cover_path')
  );
}

export default function Step1Book({ onNext }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [book, setBook] = useState<BookParseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChooseFile() {
    const selected = await pickBookFile();
    if (!selected) return;

    setFilePath(selected);
    setBook(null);
    setError(null);
    setLoading(true);

    try {
      const parsed = await parseBook(selected);
      setBook(parsed);
    } catch (err) {
      // Tauri commands reject with plain strings (AppError serializes to its
      // Display output), so accept both Error and string rejections here.
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const detail = message ? extractDetail(message) : null;
      setError(detail ?? 'Failed to parse ebook. Make sure the file is a valid EPUB, MOBI, AZW, or FB2.');
    } finally {
      setLoading(false);
    }
  }

  const title = book?.metadata?.title as string | undefined;
  const author = book?.metadata?.author as string | undefined;
  const coverSrc = book ? bookCoverSrc(book) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card p-5 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-muted text-primary">
            <BookOpen className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Choose a book</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Select an EPUB, MOBI, AZW, or FB2 file to convert.
            </p>
          </div>
        </div>

        <Button onClick={handleChooseFile} disabled={loading} className="w-fit">
          <Upload aria-hidden="true" />
          {loading ? 'Parsing...' : 'Choose File'}
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!book}
          onClick={() => book && filePath && onNext({ filePath, book })}
        >
          Next
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {book && (
        <div className="rounded-lg border bg-card p-4 flex gap-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={`Cover for ${title ?? 'selected book'}`}
              className="h-20 w-14 shrink-0 rounded object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-[var(--color-deep-slate)] text-[var(--color-parchment)]">
              <BookOpen className="size-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex flex-col gap-1">
            {title && <p className="truncate font-medium text-lg">{title}</p>}
            {author && <p className="text-muted-foreground text-sm">{author}</p>}
            <p className="text-sm mt-2">
              {book.total_chapters} chapters · {book.total_word_count.toLocaleString()} words
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
