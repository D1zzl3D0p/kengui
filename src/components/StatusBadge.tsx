import type { JobStatus } from '../api/queue';

const statusColors: Record<JobStatus, string> = {
  pending: 'bg-[rgb(184_155_77_/_18%)] text-[var(--color-ink)] border-[rgb(184_155_77_/_35%)]',
  processing: 'bg-[rgb(47_111_106_/_16%)] text-[var(--color-muted-teal)] border-[rgb(47_111_106_/_28%)]',
  completed: 'bg-[rgb(111_138_101_/_18%)] text-[var(--color-success)] border-[rgb(111_138_101_/_32%)]',
  failed: 'bg-[rgb(169_81_67_/_15%)] text-[var(--color-error)] border-[rgb(169_81_67_/_30%)]',
  cancelled: 'bg-muted text-muted-foreground border-border',
  paused: 'bg-[rgb(180_106_72_/_16%)] text-[var(--color-soft-rust)] border-[rgb(180_106_72_/_30%)]',
};

interface Props {
  status: JobStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[status]}`}
    >
      {status}
    </span>
  );
}
