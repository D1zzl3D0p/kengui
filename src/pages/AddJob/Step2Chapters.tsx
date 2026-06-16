import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { filterChapters } from '../../api/books';
import type { BookParseResponse, ChapterPreset, ChapterFilterResponse } from '../../api/books';

interface Props {
  book: BookParseResponse;
  onBack: () => void;
  onNext: (data: { chapterPreset: ChapterPreset }) => void;
}

const PRESETS: { value: ChapterPreset; label: string }[] = [
  { value: 'content-only', label: 'Content only' },
  { value: 'chapters-only', label: 'Chapters only' },
  { value: 'with-parts', label: 'With parts' },
  { value: 'none', label: 'None (all chapters)' },
];

export default function Step2Chapters({ book, onBack, onNext }: Props) {
  const [preset, setPreset] = useState<ChapterPreset>('content-only');
  const [result, setResult] = useState<ChapterFilterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchChapters(selectedPreset: ChapterPreset) {
    setLoading(true);
    setError(null);
    try {
      const data = await filterChapters(book.book_hash, selectedPreset);
      setResult(data);
    } catch {
      setError('Failed to load chapters. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchChapters('content-only');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePresetChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPreset = e.target.value as ChapterPreset;
    setPreset(newPreset);
    fetchChapters(newPreset);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Select chapters</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Choose which chapters to include in the audiobook.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <label htmlFor="preset-select" className="text-sm font-medium">
          Chapter preset
        </label>
        <select
          id="preset-select"
          value={preset}
          onChange={handlePresetChange}
          className="min-h-10 rounded-md border border-input bg-card px-3 py-2 text-sm"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading chapters…</p>
      )}

      {error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && !loading && (
        <>
          <p className="text-sm text-muted-foreground">
            {result.chapter_count} chapters · {result.estimated_word_count.toLocaleString()} words
          </p>
          <ul className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
            {result.chapters.map((chapter) => (
              <li key={chapter.index} className="flex items-center justify-between gap-3 border-b px-4 py-2 last:border-b-0">
                <span className="text-sm">{chapter.title}</span>
                <span className="text-xs text-muted-foreground">
                  {chapter.word_count.toLocaleString()} words
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={loading}
          onClick={() => onNext({ chapterPreset: preset })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
