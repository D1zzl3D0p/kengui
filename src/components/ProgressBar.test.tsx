import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct width for 50%', () => {
    const { container } = render(<ProgressBar value={0.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('clamps to 100% for values > 1', () => {
    const { container } = render(<ProgressBar value={1.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('clamps to 0% for negative values', () => {
    const { container } = render(<ProgressBar value={-0.5} />);
    const bar = container.querySelector('[style]');
    expect(bar).toHaveStyle({ width: '0%' });
  });
});
