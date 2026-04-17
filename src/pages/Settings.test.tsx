import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useConnectionStore } from '../store/connection';
import Settings from './Settings';

describe('Settings', () => {
  it('shows local mode selected by default', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const localRadio = screen.getByLabelText(/local/i);
    expect(localRadio).toBeChecked();
  });

  it('shows URL input when external mode radio is clicked', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByLabelText(/external/i));
    expect(screen.getByPlaceholderText(/http/i)).toBeInTheDocument();
  });
});
