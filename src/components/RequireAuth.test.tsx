import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/auth', () => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { useSession } from '../lib/auth';
import RequireAuth from './RequireAuth';

describe('RequireAuth', () => {
  it('shows a loading state while the session resolves', () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: true });

    render(
      <RequireAuth>
        <div>Panel</div>
      </RequireAuth>,
    );

    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
  });

  it('shows the login screen when there is no session', () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: false });

    render(
      <RequireAuth>
        <div>Panel</div>
      </RequireAuth>,
    );

    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
  });

  it('renders children when a session is present', () => {
    vi.mocked(useSession).mockReturnValue({ session: { user: { id: 'u1' } } as never, loading: false });

    render(
      <RequireAuth>
        <div>Panel</div>
      </RequireAuth>,
    );

    expect(screen.getByText('Panel')).toBeInTheDocument();
  });

  it('muestra la pantalla de login indicada en vez de la del admin', () => {
    vi.mocked(useSession).mockReturnValue({ session: null, loading: false });

    render(
      <RequireAuth login={<div>Login del organizador</div>}>
        <div>Panel</div>
      </RequireAuth>,
    );

    expect(screen.getByText('Login del organizador')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /entrar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
  });
});
