import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/platformApi', () => ({
  getEventPublic: vi.fn(),
  getMyGuest: vi.fn(),
  registerGuest: vi.fn(),
  loginGuest: vi.fn(),
  loadGuestSession: vi.fn(),
  saveGuestSession: vi.fn(),
  clearGuestSession: vi.fn(),
}));

vi.mock('../components/GuestHub', () => ({
  default: ({ guest, token }: { guest: { fullName: string }; token: string }) => (
    <div data-testid="hub">hub de {guest.fullName} con {token}</div>
  ),
}));

import * as api from '../lib/platformApi';
import EventEntryPage from './EventEntryPage';

const event: api.EventPublic = {
  id: 'ev-1',
  name: 'Cumple de Fabrizio',
  startsAt: '2026-12-05T01:00:00Z',
  location: 'Casa de Fabrizio',
  rsvpDeadline: null,
  accessMode: 'list',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealed: false,
};

const guest: api.MyGuest = { id: 'g1', eventId: 'ev-1', fullName: 'Ana María Rojas', checkedInAt: null, photoQuota: 5 };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/e/fiesta-abcd']}>
      <Routes>
        <Route path="/e/:slug" element={<EventEntryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(api.getEventPublic).mockReset();
  vi.mocked(api.getMyGuest).mockReset();
  vi.mocked(api.registerGuest).mockReset();
  vi.mocked(api.loginGuest).mockReset();
  vi.mocked(api.loadGuestSession).mockReset().mockReturnValue(null);
  vi.mocked(api.saveGuestSession).mockReset();
  vi.mocked(api.clearGuestSession).mockReset();
});

describe('EventEntryPage', () => {
  it('avisa si el evento no existe', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe/);
  });

  it('muestra el error si no se puede cargar el evento', async () => {
    vi.mocked(api.getEventPublic).mockRejectedValueOnce(new Error('No pudimos cargar el evento.'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el evento.');
  });

  it('sin sesión pide inscribirse y, al lograrlo, guarda la sesión y entra', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
    vi.mocked(api.registerGuest).mockResolvedValueOnce({
      outcome: 'ok',
      guestToken: 'tok',
      guestId: 'g1',
      guestName: 'Ana María Rojas',
    });
    vi.mocked(api.getMyGuest).mockResolvedValueOnce(guest);
    renderPage();

    await userEvent.type(await screen.findByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText(/Elige un PIN/), '4821');
    await userEvent.type(screen.getByLabelText('Repite tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(api.saveGuestSession).toHaveBeenCalledWith('fiesta-abcd', { token: 'tok', guestName: 'Ana María Rojas' });
    expect(screen.getByText('Casa de Fabrizio')).toBeInTheDocument();
    expect(screen.getByTestId('hub')).toHaveTextContent('hub de Ana María Rojas con tok');
  });

  it('con una sesión válida entra directo, sin pedir nada', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
    vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
    vi.mocked(api.getMyGuest).mockResolvedValueOnce(guest);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre y apellido')).not.toBeInTheDocument();
  });

  it('descarta una sesión vencida y vuelve a pedir identificarse', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
    vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'viejo', guestName: 'Ana' });
    vi.mocked(api.getMyGuest).mockResolvedValueOnce(null);
    renderPage();

    expect(await screen.findByLabelText('Nombre y apellido')).toBeInTheDocument();
    await waitFor(() => expect(api.clearGuestSession).toHaveBeenCalledWith('fiesta-abcd'));
  });

  it('permite iniciar sesión con nombre y PIN desde otro dispositivo', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
    vi.mocked(api.loginGuest).mockResolvedValueOnce({
      outcome: 'ok',
      guestToken: 'tok2',
      guestId: 'g1',
      guestName: 'Ana María Rojas',
    });
    vi.mocked(api.getMyGuest).mockResolvedValueOnce(guest);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Ya me inscribí' }));
    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(api.saveGuestSession).toHaveBeenCalledWith('fiesta-abcd', { token: 'tok2', guestName: 'Ana María Rojas' });
  });
});
