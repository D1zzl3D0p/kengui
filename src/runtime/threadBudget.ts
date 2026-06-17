const FALLBACK_THREAD_COUNT = 1;

export function getRequestedLocalChapterThreads(): number {
  const hardwareThreads =
    typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : FALLBACK_THREAD_COUNT;

  return Math.max(1, Math.floor(hardwareThreads));
}

export function formatRequestedLocalChapterThreads(threadCount: number): string {
  return threadCount === 1 ? '1 thread' : `${threadCount} threads`;
}
