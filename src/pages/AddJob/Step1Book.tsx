import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '../../components/ui/button';
import { parseBook } from '../../api/books';
import type { BookParseResponse } from '../../api/books';

interface Step1Data {
  filePath: string;
  book: BookParseResponse;
}

interface Props {
  onNext: (data: Step1Data) => void;
}

export default function Step1Book({ onNext }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [book, setBook] = useState<BookParseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChooseFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Ebooks', extensions: ['epub', 'mobi', 'azw', 'fb2'] }],
    });
    if (!selected || Array.isArray(selected)) return;

    setFilePath(selected);
    setBook(null);
    setError(null);
    setLoading(true);

    try {
      const parsed = await parseBook(selected);
      setBook(parsed);
    } catch {
      setError('Failed to parse ebook. Make sure the file is a valid EPUB, MOBI, AZW, or FB2.');
    } finally {
      setLoading(false);
    }
  }

  const title = book?.metadata?.title as string | undefined;
  const author = book?.metadata?.author as string | undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Choose a book</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select an EPUB, MOBI, AZW, or FB2 file to convert.
        </p>
      </div>

      <Button onClick={handleChooseFile} disabled={loading} className="w-fit">
        {loading ? 'Parsing…' : 'Choose file'}
      </Button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {book && (
        <div className="rounded-lg border p-4 flex flex-col gap-1">
          {title && <p className="font-medium text-lg">{title}</p>}
          {author && <p className="text-muted-foreground text-sm">{author}</p>}
          <p className="text-sm mt-2">
            {book.total_chapters} chapters · {book.total_word_count.toLocaleString()} words
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!book}
          onClick={() => book && filePath && onNext({ filePath, book })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
