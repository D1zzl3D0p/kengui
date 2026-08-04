import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge';
import type { JobStatus } from '../api/queue';

describe('StatusBadge', () => {
  const statuses: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'paused'];

  it.each(statuses)('renders %s status text', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('renders completed with success token class', () => {
    const { container } = render(<StatusBadge status="completed" />);
    expect(container.firstChild).toHaveClass('text-[var(--color-success)]');
  });

  it('renders failed with error token class', () => {
    const { container } = render(<StatusBadge status="failed" />);
    expect(container.firstChild).toHaveClass('text-[var(--color-error)]');
  });
});
