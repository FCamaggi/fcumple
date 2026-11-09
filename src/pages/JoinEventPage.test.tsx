import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('../lib/auth', () => ({
  useSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/organizerApi', () => ({
  acceptOwnerInvite: vi.fn(),
  getMyEvent: vi.fn(),
  listEventGuests: vi.fn(),
  listEventPhotos: vi.fn(),
}));

import { useSession } from '../lib/auth';
import { acceptOwnerInvite, getMyEvent, listEventGuests, listEventPhotos } from '../lib/organizerApi';
import App from '../App';
import JoinEventPage from './JoinEventPage';

function Where() {
  const location = useLocation();
  const navType = useNavigationType();
  return (
    <span data-testid="where" data-nav-type={navType}>
      {location.pathname}
    </span>
  );
}

function renderJoin(token = 'tok-123') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/origen', `/panel/unirse/${token}`]} initialIndex={1}>
        <Routes>
          <Route path="/panel/unirse/:token" element={<JoinEventPage />} />
          <Route path="/panel/e/:eventId" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.mocked(acceptOwnerInvite).mockReset();
  vi.mocked(getMyEvent).mockReset();
  vi.mocked(listEventGuests).mockReset();
  vi.mocked(listEventPhotos).mockReset();
  vi.mocked(useSession).mockReset();
});

describe('JoinEventPage', () => {
  it('acepta la invitación una sola vez (incluso en StrictMode) y redirige con replace a /panel/e/<id>', async () => {
    vi.mocked(acceptOwnerInvite).mockResolvedValueOnce('ev-42');
    renderJoin('tok-abc');

    const dest = await screen.findByTestId('where');
    expect(dest).toHaveTextContent('/panel/e/ev-42');
    expect(dest).toHaveAttribute('data-nav-type', 'REPLACE');
    expect(acceptOwnerInvite).toHaveBeenCalledTimes(1);
    expect(acceptOwnerInvite).toHaveBeenCalledWith('tok-abc');
  });

  it('muestra el aviso de link inválido o vencido (P0002) y un enlace para volver a /panel', async () => {
    vi.mocked(acceptOwnerInvite).mockRejectedValueOnce(
      new Error('El link no es válido, ya se usó o venció. Pídele uno nuevo a quien te invitó.'),
    );
    renderJoin('tok-vencido');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El link no es válido, ya se usó o venció. Pídele uno nuevo a quien te invitó.',
    );
    expect(screen.getByRole('link', { name: /Tus eventos/i })).toHaveAttribute('href', '/panel');
  });

  it('muestra el mensaje de tope de dueños (53400) y un enlace para volver a /panel', async () => {
    vi.mocked(acceptOwnerInvite).mockRejectedValueOnce(
      new Error('Este evento ya llegó al máximo de dueños (10).'),
    );
    renderJoin('tok-tope');

    expect(await screen.findByRole('alert')).toHaveTextContent('Este evento ya llegó al máximo de dueños (10).');
    expect(screen.getByRole('link', { name: /Tus eventos/i })).toHaveAttribute('href', '/panel');
  });

  describe('ruta /panel/unirse/:token en App', () => {
    it('sin sesión muestra OrganizerLogin en la misma URL y al iniciar sesión acepta la invitación', async () => {
      window.history.pushState({}, '', '/panel/unirse/tok-ruta');
      vi.mocked(useSession).mockReturnValue({ session: null, loading: false });

      const { rerender } = render(<App />);
      expect(screen.getByLabelText('Correo')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/panel/unirse/tok-ruta');
      expect(acceptOwnerInvite).not.toHaveBeenCalled();

      vi.mocked(useSession).mockReturnValue({
        session: { user: { id: 'u-2', email: 'co@example.com' } } as never,
        loading: false,
      });
      vi.mocked(acceptOwnerInvite).mockResolvedValueOnce('ev-99');
      vi.mocked(getMyEvent).mockResolvedValueOnce(null);
      vi.mocked(listEventGuests).mockResolvedValueOnce([]);
      vi.mocked(listEventPhotos).mockResolvedValue([]);

      rerender(<App />);

      expect(await screen.findByRole('alert')).toHaveTextContent(/no existe o no es tuyo/i);
      expect(window.location.pathname).toBe('/panel/e/ev-99');
      expect(acceptOwnerInvite).toHaveBeenCalledTimes(1);
      expect(acceptOwnerInvite).toHaveBeenCalledWith('tok-ruta');
    });
  });
});
