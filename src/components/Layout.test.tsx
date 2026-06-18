import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';

describe('Layout navigation', () => {
  it('links to the Audiobooks page from the desktop navigation', () => {
    render(
      <MemoryRouter initialEntries={['/audiobooks']}>
        <Layout>
          <div>Page content</div>
        </Layout>
      </MemoryRouter>
    );

    const audiobooksLink = screen.getByRole('link', { name: /audiobooks/i });
    expect(audiobooksLink).toHaveAttribute('href', '/audiobooks');
  });
});
