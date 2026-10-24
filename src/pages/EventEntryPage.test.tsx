import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/platformApi', () => ({
  getEventPublic: vi.fn(),
  getMyGuest: vi.fn(),
  registerGuest: vi.fn(),
  loginGuest: vi.fn(),
  loadGuestSession: vi.fn(),
  saveGuestSession: vi.fn(),
  clearGuestSession: vi.fn(),
  activateCamera: vi.fn(),
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
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  subtitle: null,
  theme: {},
};

const guest: api.MyGuest = { id: 'g1', eventId: 'ev-1', fullName: 'Ana María Rojas', checkedInAt: null, photoQuota: 5, cameraActivatedAt: null };

function renderPage(path = '/e/fiesta-abcd') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/e/:slug/*" element={<EventEntryPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  return <div data-testid="ruta">{useLocation().pathname}</div>;
}

const CODE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

beforeEach(() => {
  vi.mocked(api.getEventPublic).mockReset();
  vi.mocked(api.getMyGuest).mockReset();
  vi.mocked(api.registerGuest).mockReset();
  vi.mocked(api.loginGuest).mockReset();
  vi.mocked(api.loadGuestSession).mockReset().mockReturnValue(null);
  vi.mocked(api.saveGuestSession).mockReset();
  vi.mocked(api.clearGuestSession).mockReset();
  vi.mocked(api.activateCamera).mockReset();
  document.documentElement.removeAttribute('style');
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

  it('muestra el subtítulo debajo del título del evento', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, name: 'PUTI HALLOWEEN', subtitle: 'Cumpleaños Fran' });
    vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
    vi.mocked(api.getMyGuest).mockResolvedValueOnce(guest);
    renderPage();
    expect(await screen.findByText('PUTI HALLOWEEN')).toBeInTheDocument();
    expect(screen.getByText('Cumpleaños Fran')).toBeInTheDocument();
  });

  it('aplica el estilo del evento: el formulario ya sale con su paleta, antes de inscribirse', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, theme: { preset: 'rosa-chicle' } });
    renderPage();
    await screen.findByLabelText('Nombre y apellido');
    expect(document.documentElement.style.getPropertyValue('--c-acid-400')).toBe('255 95 162');
  });

  it('un evento sin estilo se ve como siempre (neón)', async () => {
    vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
    renderPage();
    await screen.findByLabelText('Nombre y apellido');
    expect(document.documentElement.style.getPropertyValue('--c-acid-400')).toBe('200 255 61');
  });

  it('la pantalla de carga no usa el color del acento (evita un destello del color equivocado)', () => {
    vi.mocked(api.getEventPublic).mockReturnValueOnce(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Cargando...').className).not.toMatch(/acid/);
  });

  describe('QR de activación de la cámara (/e/:slug/a/:code)', () => {
    it('con sesión activa la cámara, avisa y quita el código de la dirección', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      vi.mocked(api.activateCamera).mockResolvedValueOnce(true);
      renderPage(`/e/fiesta-abcd/a/${CODE}`);

      expect(await screen.findByRole('status')).toHaveTextContent('Cámara activada');
      expect(api.activateCamera).toHaveBeenCalledWith('tok', CODE);
      await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/e\/fiesta-abcd$/));
      expect(api.activateCamera).toHaveBeenCalledTimes(1);
    });

    it('quita el código de la dirección apenas se abre la página, antes de inscribirse o activar', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      renderPage(`/e/fiesta-abcd/a/${CODE}`);
      await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/e\/fiesta-abcd$/));
      expect(screen.getByTestId('ruta').textContent).not.toContain(CODE);
      // Y aun así lo usa cuando la persona entra.
      expect(api.activateCamera).not.toHaveBeenCalled();
    });

    it('sin sesión: primero se inscribe y recién entonces se activa con el mismo código', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      vi.mocked(api.registerGuest).mockResolvedValueOnce({
        outcome: 'ok',
        guestToken: 'tok',
        guestId: 'g1',
        guestName: 'Ana María Rojas',
      });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      vi.mocked(api.activateCamera).mockResolvedValueOnce(true);
      renderPage(`/e/fiesta-abcd/a/${CODE}`);

      await userEvent.type(await screen.findByLabelText('Nombre y apellido'), 'Ana Rojas');
      await userEvent.type(screen.getByLabelText(/Elige un PIN/), '4821');
      await userEvent.type(screen.getByLabelText('Repite tu PIN'), '4821');
      expect(api.activateCamera).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Cámara activada');
      expect(api.activateCamera).toHaveBeenCalledWith('tok', CODE);
    });

    it('un código que ya no sirve (QR cambiado) lo dice, sin romper la entrada', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      vi.mocked(api.activateCamera).mockResolvedValueOnce(false);
      renderPage(`/e/fiesta-abcd/a/${CODE}`);

      expect(await screen.findByRole('alert')).toHaveTextContent('Este código ya no sirve');
      expect(screen.getByTestId('hub')).toBeInTheDocument();
    });

    it('si falla la red al activar, lo dice con el motivo', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      vi.mocked(api.activateCamera).mockRejectedValueOnce(new Error('Demasiados intentos seguidos. Espera unos minutos.'));
      renderPage(`/e/fiesta-abcd/a/${CODE}`);
      expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
    });

    it('sin código en la dirección no intenta activar nada', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce({ ...event, cameraUnlock: 'on_event_qr' });
      vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      renderPage();
      await screen.findByTestId('hub');
      expect(api.activateCamera).not.toHaveBeenCalled();
    });

    it('una cola de dirección que no es un código válido se ignora', async () => {
      vi.mocked(api.getEventPublic).mockResolvedValueOnce(event);
      vi.mocked(api.loadGuestSession).mockReturnValue({ token: 'tok', guestName: 'Ana' });
      vi.mocked(api.getMyGuest).mockResolvedValue(guest);
      renderPage('/e/fiesta-abcd/a/corto');
      await screen.findByTestId('hub');
      expect(api.activateCamera).not.toHaveBeenCalled();
    });
  });
});
