import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/organizerApi', () => ({
  listMyEvents: vi.fn(),
  createEvent: vi.fn(),
  getMyEvent: vi.fn(),
  listEventGuests: vi.fn(),
  addGuests: vi.fn(),
  setGuestApproval: vi.fn(),
  removeGuest: vi.fn(),
  regenerateGuestToken: vi.fn(),
  updateEvent: vi.fn(),
}));
vi.mock('../lib/adminApi', () => ({ checkInGuest: vi.fn() }));
vi.mock('../components/QrScanner', () => ({
  default: ({ guests, onClose }: { guests: Array<{ token?: string }>; onClose: () => void }) => (
    <div data-testid="scanner">escáner con {guests.map((g) => g.token).join(',')}<button type="button" onClick={onClose}>cerrar escáner</button></div>
  ),
}));
vi.mock('../components/PhotosTab', () => ({ default: () => <div data-testid="photos-tab" /> }));
vi.mock('../components/studio/CameraStudio', () => ({ default: () => <div data-testid="camera-studio" /> }));
vi.mock('../lib/auth', () => ({ signOut: vi.fn(), signIn: vi.fn(), useSession: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));

import * as api from '../lib/organizerApi';
import { checkInGuest } from '../lib/adminApi';
import OrganizerEventsPage from './OrganizerEventsPage';
import OrganizerEventPage from './OrganizerEventPage';

const event: api.OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta de Ana',
  startsAt: null,
  location: null,
  accessMode: 'list',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  createdAt: '2026-10-15T00:00:00Z',
};

const ana: api.OrganizerGuest = {
  id: 'g1',
  eventId: 'ev-1',
  fullName: 'Ana Rojas',
  token: 'tok',
  approvalStatus: 'approved',
  status: 'pending',
  plusOnesAllowed: 0,
  plusOnesConfirmed: 0,
  photoQuota: 5,
  checkedInAt: null,
  claimedAt: null,
  lastSeenAt: null,
};

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

beforeEach(() => {
  for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockReset();
});

describe('OrganizerEventsPage', () => {
  function renderList() {
    render(
      <MemoryRouter initialEntries={['/panel']}>
        <Routes>
          <Route path="/panel" element={<OrganizerEventsPage />} />
          <Route path="/panel/e/:eventId" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('lista los eventos del organizador', async () => {
    vi.mocked(api.listMyEvents).mockResolvedValueOnce([event]);
    renderList();
    expect(await screen.findByText('Fiesta de Ana')).toBeInTheDocument();
    expect(screen.getByText('/e/fiesta-abcd')).toBeInTheDocument();
  });

  it('invita a crear el primero cuando no hay eventos', async () => {
    vi.mocked(api.listMyEvents).mockResolvedValueOnce([]);
    renderList();
    expect(await screen.findByText(/Todavía no tienes eventos/)).toBeInTheDocument();
  });

  it('crea un evento y navega a su panel', async () => {
    vi.mocked(api.listMyEvents).mockResolvedValueOnce([]);
    vi.mocked(api.createEvent).mockResolvedValueOnce(event);
    renderList();

    await userEvent.type(await screen.findByLabelText('Nombre del nuevo evento'), 'Fiesta de Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(api.createEvent).toHaveBeenCalledWith({ name: 'Fiesta de Ana' });
    expect(await screen.findByTestId('where')).toHaveTextContent('/panel/e/ev-1');
  });

  it('muestra el error si no se puede crear', async () => {
    vi.mocked(api.listMyEvents).mockResolvedValueOnce([]);
    vi.mocked(api.createEvent).mockRejectedValueOnce(new Error('No pudimos crear el evento. Intenta de nuevo.'));
    renderList();

    await userEvent.type(await screen.findByLabelText('Nombre del nuevo evento'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos crear el evento');
  });
});

describe('OrganizerEventPage', () => {
  function renderEvent() {
    render(
      <MemoryRouter initialEntries={['/panel/e/ev-1']}>
        <Routes>
          <Route path="/panel/e/:eventId" element={<OrganizerEventPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('carga el evento con su lista de invitados', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
    renderEvent();

    expect(await screen.findByRole('heading', { name: 'Fiesta de Ana' })).toBeInTheDocument();
    expect(screen.getByText('Ana Rojas')).toBeInTheDocument();
  });

  it('dice que el evento no existe si no es del organizador', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(null);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe o no es tuyo/);
  });

  it('agrega invitados y los refleja en la lista', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    vi.mocked(api.addGuests).mockResolvedValueOnce({ created: [ana], failed: [] });
    renderEvent();

    await userEvent.type(await screen.findByLabelText(/Agregar invitados/), 'Ana Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByText('Ana Rojas')).toBeInTheDocument();
    expect(api.addGuests).toHaveBeenCalledWith('ev-1', ['Ana Rojas'], 5);
  });

  it('quita un invitado de la lista tras confirmarlo', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
    vi.mocked(api.removeGuest).mockResolvedValueOnce(undefined);
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }));

    await waitFor(() => expect(screen.queryByText('Ana Rojas')).not.toBeInTheDocument());
    expect(api.removeGuest).toHaveBeenCalledWith('g1');
  });

  it('aprueba una solicitud pendiente y el invitado pasa a la lista', async () => {
    const pending = { ...ana, id: 'p1', fullName: 'Pedro Pascal', approvalStatus: 'pending' as const };
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([pending]);
    vi.mocked(api.setGuestApproval).mockResolvedValueOnce({ ...pending, approvalStatus: 'approved' });
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Invitados: 1 · han entrado: 0')).toBeInTheDocument();
    expect(api.setGuestApproval).toHaveBeenCalledWith('p1', 'approved');
  });

  it('muestra el enlace único en la pestaña Enlace y guarda ajustes en Ajustes', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    vi.mocked(api.updateEvent).mockResolvedValueOnce({ ...event, accessMode: 'open' });
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Enlace' }));
    expect(screen.getByText(`${window.location.origin}/e/fiesta-abcd`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    await userEvent.selectOptions(screen.getByLabelText('Quién puede entrar'), 'open');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    await waitFor(() =>
      expect(api.updateEvent).toHaveBeenCalledWith('ev-1', expect.objectContaining({ accessMode: 'open' })),
    );
  });

  it('Inscripción: configura qué se pide al invitado y lo guarda en el evento', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    vi.mocked(api.updateEvent).mockResolvedValueOnce(event);
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Inscripción' }));
    await userEvent.click(screen.getByLabelText('Permitir acompañantes (+1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar inscripción' }));

    await waitFor(() =>
      expect(api.updateEvent).toHaveBeenCalledWith(
        'ev-1',
        expect.objectContaining({ enrollment: expect.objectContaining({ plusOnes: { max: 1 } }) }),
      ),
    );
  });

  it('Puerta: marca la llegada buscando por nombre y la refleja', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
    vi.mocked(checkInGuest).mockResolvedValueOnce({
      id: 'g1',
      fullName: 'Ana Rojas',
      status: 'pending',
      plusOnesAllowed: 0,
      plusOnesConfirmed: 0,
      guestNote: null,
      respondedAt: null,
      checkedInAt: '2026-10-15T22:00:00Z',
    });
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Puerta' }));
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }));

    expect(await screen.findByText('Ya llegó')).toBeInTheDocument();
    expect(checkInGuest).toHaveBeenCalledWith('tok');
    expect(screen.getByText('Han llegado: 1 de 1')).toBeInTheDocument();
  });

  it('Puerta: el escáner recibe a los invitados con su token', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
    renderEvent();

    await userEvent.click(await screen.findByRole('button', { name: 'Puerta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir escáner' }));
    expect(screen.getByTestId('scanner')).toHaveTextContent('escáner con tok');

    await userEvent.click(screen.getByRole('button', { name: 'cerrar escáner' }));
    expect(screen.queryByTestId('scanner')).not.toBeInTheDocument();
  });

  it('Fotos: muestra la pestaña de moderación', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Fotos' }));
    expect(screen.getByTestId('photos-tab')).toBeInTheDocument();
  });

  it('Cámara: muestra el estudio de marcos y stickers', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Cámara' }));
    expect(screen.getByTestId('camera-studio')).toBeInTheDocument();
  });
});
