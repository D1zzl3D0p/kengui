import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { filterChapters } from '../../api/books';
import type { BookParseResponse, ChapterPreset } from '../../api/books';
import type { ChapterSelection } from '../../api/queue';

interface Props {
  book: BookParseResponse;
  onBack: () => void;
  onNext: (data: { chapterPreset: ChapterPreset; chapterSelection: ChapterSelection }) => void;
}

const PRESETS: { value: ChapterPreset; label: string }[] = [
  { value: 'content-only', label: 'Content only' },
  { value: 'chapters-only', label: 'Chapters only' },
  { value: 'with-parts', label: 'With parts' },
  { value: 'none', label: 'None (all chapters)' },
];

function chapterIndices(chapters: BookParseResponse['chapters']) {
  return new Set(chapters.map((chapter) => chapter.index));
}

export default function Step2Chapters({ book, onBack, onNext }: Props) {
  const [preset, setPreset] = useState<ChapterPreset>('content-only');
  const [selectionPreset, setSelectionPreset] = useState<ChapterPreset>('content-only');
  const [includedIndices, setIncludedIndices] = useState<Set<number>>(() =>
    chapterIndices(book.chapters)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function applyPreset(selectedPreset: ChapterPreset) {
    setLoading(true);
    setError(null);
    try {
      const data = await filterChapters(book.book_hash, selectedPreset, book.book_id);
      setIncludedIndices(new Set(data.included_indices));
      setPreset(selectedPreset);
      setSelectionPreset(selectedPreset);
    } catch {
      setError('Failed to load chapters. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    applyPreset('content-only');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePresetChange(e: React.ChangeEvent<HTMLSelectElement>) {
    applyPreset(e.target.value as ChapterPreset);
  }

  function toggleChapter(index: number) {
    setIncludedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setSelectionPreset('custom');
  }

  const selection = useMemo<ChapterSelection>(() => {
    const included = book.chapters
      .map((chapter) => chapter.index)
      .filter((index) => includedIndices.has(index));
    const excluded = book.chapters
      .map((chapter) => chapter.index)
      .filter((index) => !includedIndices.has(index));

    return {
      preset: selectionPreset,
      included,
      excluded,
    };
  }, [book.chapters, includedIndices, selectionPreset]);

  const selectedCount = selection.included.length;
  const totalCount = book.chapters.length;
  const selectionSummary =
    selectionPreset === 'custom'
      ? 'Manual chapter edits are applied on top of the selected preset.'
      : 'Preset changes update the full chapter selection.';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Select chapters</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a preset, then fine-tune each chapter below.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={loading}
          onClick={() => onNext({ chapterPreset: selectionPreset, chapterSelection: selection })}
        >
          Next
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        <div className="flex flex-col gap-2">
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

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            {selectedCount} of {totalCount} chapters selected
          </span>
          <span className="hidden sm:inline">•</span>
          <span>{selectionSummary}</span>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading chapter preset…</p>}

      {error && (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_8px_24px_rgb(40_58_66_/_7%)]">
        {book.chapters.map((chapter) => {
          const checked = includedIndices.has(chapter.index);
          return (
            <li
              key={chapter.index}
              className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChapter(chapter.index)}
                  disabled={loading}
                  className="size-4 rounded border-input text-primary"
                />
                <span className="min-w-0 flex-1 text-sm">{chapter.title}</span>
              </label>
              <span className="text-xs text-muted-foreground">
                {chapter.word_count.toLocaleString()} words
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
