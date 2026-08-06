import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useConnectionStore } from '../store/connection';

vi.mock('../auth/supabase', () => ({
  clearAuthSession: vi.fn(),
  exchangeSupabaseCode: vi.fn(),
  loadAuthSessionSummary: vi.fn(async () => null),
  supabaseOAuthErrorMessage: vi.fn(() => null),
}));
vi.mock('../auth/oauthStart', () => ({ beginSupabaseOAuth: vi.fn() }));
vi.mock('../runtime/connectRuntime', () => ({ connectCurrentRuntime: vi.fn() }));
vi.mock('../platform', () => ({ deepLinks: { onAuthCallback: vi.fn(async () => () => {}) } }));

async function renderConnecting() {
  vi.resetModules();
  const Connecting = (await import('./Connecting')).default;
  render(
    <MemoryRouter>
      <Connecting />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_KENGUI_ENABLE_HOSTED', 'true');
  vi.stubEnv('VITE_KENGUI_HOSTED_URL', 'https://api.kengui.app');
  sessionStorage.clear();
  useConnectionStore.setState({
    serverMode: 'local',
    serverUrl: 'http://localhost:45365',
    authMode: 'none',
    lastConnectedAt: null,
  });
});
afterEach(() => cleanup());

describe('Connecting hosted section', () => {
  it('shows the hosted control plane URL as read-only text, not an editable input', async () => {
    await renderConnecting();

    fireEvent.click(screen.getByRole('button', { name: /Kengui Cloud/i }));

    expect(await screen.findByText('https://api.kengui.app')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Hosted control plane URL/i)).toBeNull();
  });

  it('restores the hosted selection after an OAuth redirect reload', async () => {
    sessionStorage.setItem('kengui.oauth.returnMode', 'hosted');

    await renderConnecting();

    expect(screen.getByRole('button', { name: /Kengui Cloud/i })).toHaveClass(
      'border-primary'
    );
    expect(screen.getByText('https://api.kengui.app')).toBeInTheDocument();
    expect(sessionStorage.getItem('kengui.oauth.returnMode')).toBeNull();
  });
});
