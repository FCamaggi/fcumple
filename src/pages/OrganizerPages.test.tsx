import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

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
  listEventPhotos: vi.fn(),
  moderateEventPhoto: vi.fn(),
  publishPhotoBatch: vi.fn(),
}));
vi.mock('../lib/adminApi', () => ({ checkInGuest: vi.fn() }));
vi.mock('../components/QrScanner', () => ({
  default: ({ guests, onClose }: { guests: Array<{ token?: string }>; onClose: () => void }) => (
    <div data-testid="scanner">escáner con {guests.map((g) => g.token).join(',')}<button type="button" onClick={onClose}>cerrar escáner</button></div>
  ),
}));
vi.mock('../components/PhotosTab', () => ({
  default: ({ photos }: { photos: { photos: unknown[] | null } }) => (
    <div data-testid="photos-tab">{photos.photos?.length ?? 0} fotos</div>
  ),
}));
vi.mock('../components/PartyDayTab', () => ({
  default: ({
    guests,
    onOpenTab,
    onRefresh,
  }: {
    guests: unknown[];
    onOpenTab: (tab: 'fotos' | 'activacion' | 'invitados') => void;
    onRefresh: () => void;
  }) => (
    <div data-testid="party-day-tab">
      hoy con {guests.length} invitado(s)
      <button type="button" onClick={() => onOpenTab('activacion')}>ir a activación</button>
      <button type="button" onClick={onRefresh}>refrescar hoy</button>
    </div>
  ),
}));
vi.mock('../components/PostsPanel', () => ({
  default: ({ eventId }: { eventId?: string }) => <div data-testid="posts-panel">avisos de {eventId}</div>,
}));
vi.mock('../components/ActivationTab', () => ({
  default: ({ event }: { event: { activationCode: string } }) => <div data-testid="activation-tab">código {event.activationCode}</div>,
}));
vi.mock('../components/studio/CameraStudio', () => ({ default: () => <div data-testid="camera-studio" /> }));
vi.mock('../components/GuestPreviewTab', () => ({
  default: ({ event }: { event: { id: string } }) => <div data-testid="guest-preview-tab">vista previa de {event.id}</div>,
}));
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
  subtitle: null,
  theme: {},
  activationCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
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
  answers: {},
  plusOnesRequested: 0,
  checkedInAt: null,
  claimedAt: null,
  lastSeenAt: null,
  cameraActivatedAt: null,
};

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

beforeEach(() => {
  for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(api.listEventPhotos).mockResolvedValue([]);
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
    return render(
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

  describe('si no carga el evento', () => {
    it('muestra el error con «Reintentar» y, al reintentar, abre el panel', async () => {
      vi.mocked(api.getMyEvent).mockRejectedValueOnce(new Error('No pudimos cargar el evento.')).mockResolvedValueOnce(event);
      vi.mocked(api.listEventGuests).mockResolvedValue([ana]);
      renderEvent();

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el evento.');
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('Ana Rojas')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('mientras carga lo dice con role="status"', () => {
      vi.mocked(api.getMyEvent).mockReturnValue(new Promise(() => undefined));
      vi.mocked(api.listEventGuests).mockReturnValue(new Promise(() => undefined));
      renderEvent();
      expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    });

    it('un evento que no existe no ofrece reintentar: no es un fallo de red', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce(null);
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
      renderEvent();

      expect(await screen.findByRole('alert')).toHaveTextContent(/no existe o no es tuyo/i);
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });
  });

  describe('insignia de fotos por revisar', () => {
    const pendingPhoto = (id: string) =>
      ({ id, status: 'pending', publishedAt: null, guestFullName: 'Ana Rojas' }) as unknown as Awaited<
        ReturnType<typeof api.listEventPhotos>
      >[number];

    function openEvent() {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
      renderEvent();
    }

    it('se ve en «Fotos» desde cualquier pestaña, con la cuenta de las pendientes', async () => {
      vi.mocked(api.listEventPhotos).mockResolvedValue([pendingPhoto('a'), pendingPhoto('b'), pendingPhoto('c')]);
      openEvent();

      expect(await screen.findByText('Ana Rojas')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /Fotos.*3 por revisar/ })).toBeInTheDocument();
    });

    it('al pasar a otro evento no se ve la insignia del anterior', async () => {
      vi.mocked(api.listEventPhotos).mockResolvedValueOnce([pendingPhoto('a'), pendingPhoto('b')]);
      vi.mocked(api.getMyEvent).mockResolvedValueOnce(event).mockResolvedValueOnce({ ...event, id: 'ev-2', name: 'Otra fiesta' });
      vi.mocked(api.listEventGuests).mockResolvedValue([ana]);
      function GoToOther() {
        const navigate = useNavigate();
        return (
          <button type="button" onClick={() => navigate('/panel/e/ev-2')}>
            ir al otro evento
          </button>
        );
      }
      render(
        <MemoryRouter initialEntries={['/panel/e/ev-1']}>
          <GoToOther />
          <Routes>
            <Route path="/panel/e/:eventId" element={<OrganizerEventPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByRole('button', { name: /Fotos.*2 por revisar/ })).toBeInTheDocument();

      vi.mocked(api.listEventPhotos).mockReturnValueOnce(new Promise(() => undefined));
      await userEvent.click(screen.getByRole('button', { name: 'ir al otro evento' }));

      expect(await screen.findByText('Otra fiesta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fotos' })).toHaveTextContent(/^Fotos$/);
    });

    it('sin fotos por revisar no hay insignia', async () => {
      openEvent();
      await screen.findByText('Ana Rojas');

      await waitFor(() => expect(api.listEventPhotos).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Fotos' })).toHaveTextContent(/^Fotos$/);
    });

    it('no hay sondeo: pide las fotos una vez y otra por cada cambio de pestaña', async () => {
      vi.mocked(api.listEventPhotos).mockResolvedValueOnce([pendingPhoto('a')]).mockResolvedValueOnce([
        pendingPhoto('a'),
        pendingPhoto('b'),
      ]);
      openEvent();
      expect(await screen.findByRole('button', { name: /Fotos.*1 por revisar/ })).toBeInTheDocument();
      expect(api.listEventPhotos).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByRole('button', { name: 'Avisos' }));

      expect(await screen.findByRole('button', { name: /Fotos.*2 por revisar/ })).toBeInTheDocument();
      expect(api.listEventPhotos).toHaveBeenCalledTimes(2);
    });

    it('si no puede leer las fotos, no muestra una cuenta que podría ser falsa', async () => {
      vi.mocked(api.listEventPhotos).mockResolvedValueOnce([pendingPhoto('a')]).mockRejectedValueOnce(new Error('sin red'));
      openEvent();
      expect(await screen.findByRole('button', { name: /Fotos.*1 por revisar/ })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Avisos' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Fotos' })).toHaveTextContent(/^Fotos$/));
    });

    it('la pestaña «Fotos» recibe las mismas fotos, sin pedirlas otra vez', async () => {
      vi.mocked(api.listEventPhotos).mockResolvedValue([pendingPhoto('a')]);
      openEvent();
      await screen.findByRole('button', { name: /Fotos.*1 por revisar/ });

      await userEvent.click(screen.getByRole('button', { name: /^Fotos/ }));

      expect(await screen.findByTestId('photos-tab')).toHaveTextContent('1 fotos');
    });
  });

  describe('pestaña «Hoy»', () => {
    const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
    const inAWeek = () => new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

    it('el día de la fiesta se abre en «Hoy»', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, startsAt: inAnHour() });
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
      renderEvent();

      expect(await screen.findByTestId('party-day-tab')).toHaveTextContent('hoy con 1 invitado(s)');
      expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
    });

    it('otro día se abre en «Invitados», pero «Hoy» sigue disponible', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, startsAt: inAWeek() });
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
      renderEvent();

      expect(await screen.findByText('Ana Rojas')).toBeInTheDocument();
      expect(screen.queryByTestId('party-day-tab')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Hoy' }));
      expect(screen.getByTestId('party-day-tab')).toBeInTheDocument();
    });

    it('un evento sin fecha se abre en «Invitados»', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
      renderEvent();

      expect(await screen.findByText('Ana Rojas')).toBeInTheDocument();
      expect(screen.queryByTestId('party-day-tab')).not.toBeInTheDocument();
    });

    it('«Actualizar» en «Hoy» vuelve a leer los invitados y conserva la pestaña', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, startsAt: inAnHour() });
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]).mockResolvedValueOnce([ana, { ...ana, id: 'g2' }]);
      renderEvent();
      await screen.findByText('hoy con 1 invitado(s)');

      await userEvent.click(screen.getByRole('button', { name: 'refrescar hoy' }));

      expect(await screen.findByText('hoy con 2 invitado(s)')).toBeInTheDocument();
      expect(api.listEventGuests).toHaveBeenCalledTimes(2);
    });

    it('si falla al actualizar conserva la lista que ya tenía', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, startsAt: inAnHour() });
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]).mockRejectedValueOnce(new Error('sin red'));
      renderEvent();
      await screen.findByText('hoy con 1 invitado(s)');

      await userEvent.click(screen.getByRole('button', { name: 'refrescar hoy' }));

      await waitFor(() => expect(api.listEventGuests).toHaveBeenCalledTimes(2));
      expect(screen.getByText('hoy con 1 invitado(s)')).toBeInTheDocument();
    });

    it('los atajos de «Hoy» llevan a la pestaña que piden', async () => {
      vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, startsAt: inAnHour() });
      vi.mocked(api.listEventGuests).mockResolvedValueOnce([ana]);
      renderEvent();

      await userEvent.click(await screen.findByRole('button', { name: 'ir a activación' }));

      expect(screen.getByTestId('activation-tab')).toBeInTheDocument();
    });
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

  it('Avisos: la organizadora publica avisos de ESTE evento', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Avisos' }));
    expect(screen.getByTestId('posts-panel')).toHaveTextContent('avisos de ev-1');
  });

  it('Activación: muestra el QR de la fiesta de este evento', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Activación' }));
    expect(screen.getByTestId('activation-tab')).toHaveTextContent('código a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });

  it('aplica el estilo del evento al panel, y lo suelta al salir', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce({ ...event, theme: { preset: 'rosa-chicle' } });
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    const { unmount } = renderEvent();
    await screen.findByRole('button', { name: 'Avisos' });
    expect(document.documentElement.style.getPropertyValue('--c-acid-400')).toBe('255 95 162');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--c-acid-400')).toBe('');
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

  it('Vista previa: muestra lo que ve el invitado en este evento', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));
    expect(screen.getByTestId('guest-preview-tab')).toHaveTextContent('vista previa de ev-1');
  });

  it('Cámara: muestra el estudio de marcos y stickers', async () => {
    vi.mocked(api.getMyEvent).mockResolvedValueOnce(event);
    vi.mocked(api.listEventGuests).mockResolvedValueOnce([]);
    renderEvent();
    await userEvent.click(await screen.findByRole('button', { name: 'Cámara' }));
    expect(screen.getByTestId('camera-studio')).toBeInTheDocument();
  });
});
