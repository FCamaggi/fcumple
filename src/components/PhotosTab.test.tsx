import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/organizerApi', () => ({
  listEventPhotos: vi.fn(),
  moderateEventPhoto: vi.fn(),
  publishPhotoBatch: vi.fn(),
}));
vi.mock('./PhotoModerationPanel', () => ({
  default: ({
    source,
    onClose,
  }: {
    source: { list: () => Promise<unknown>; moderate: (id: string, s: 'approved') => Promise<unknown>; publish: () => Promise<number> };
    onClose: () => void;
  }) => (
    <div data-testid="moderation">
      <button type="button" onClick={() => void source.list()}>
        listar
      </button>
      <button type="button" onClick={() => void source.moderate('p1', 'approved')}>
        aprobar
      </button>
      <button type="button" onClick={() => void source.publish()}>
        publicar lote
      </button>
      <button type="button" onClick={onClose}>
        cerrar
      </button>
    </div>
  ),
}));

import * as api from '../lib/organizerApi';
import PhotosTabView from './PhotosTab';
import { useEventPhotos } from '../hooks/useEventPhotos';

/** La pestaña recibe el estado de las fotos de la página; aquí lo arma el mismo hook. */
function PhotosTab(props: { event: api.OrganizerEvent; onEventChange: (e: api.OrganizerEvent) => void }) {
  const photos = useEventPhotos(props.event, props.onEventChange);
  return <PhotosTabView photos={photos} />;
}

const event: api.OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
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

function photo(id: string, status: 'pending' | 'approved' | 'rejected', publishedAt: string | null = null) {
  return {
    id,
    guestId: 'g1',
    storagePath: `ev-1/g1/${id}.jpg`,
    displayStoragePath: null,
    status,
    createdAt: '2026-10-15T00:00:00Z',
    publishedAt,
    guestFullName: 'Ana Rojas',
  };
}

beforeEach(() => {
  vi.mocked(api.listEventPhotos)
    .mockReset()
    .mockResolvedValue([photo('a', 'pending'), photo('b', 'approved'), photo('c', 'rejected')]);
  vi.mocked(api.moderateEventPhoto).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.publishPhotoBatch).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PhotosTab', () => {
  it('resume las fotos por estado y ofrece revisar las pendientes', async () => {
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByText('3 fotos · 1 por revisar · 1 aprobadas · 1 rechazadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar 1 foto(s)' })).toBeInTheDocument();
  });

  it('explica que los invitados no ven nada hasta publicar, y cuántas aprobadas faltan', async () => {
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByText(/no ven ninguna foto hasta que tú las publicas/)).toBeInTheDocument();
    expect(screen.getByText(/Tienes 1 aprobada\(s\) sin publicar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar 1 aprobada(s)' })).toBeEnabled();
  });

  it('sin aprobadas por publicar, el botón queda apagado', async () => {
    vi.mocked(api.listEventPhotos).mockResolvedValue([photo('a', 'pending'), photo('b', 'approved', '2026-10-30T23:00:00Z')]);
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Publicar 0 aprobada(s)' })).toBeDisabled();
  });

  it('publica el lote, avisa cuántas fueron, marca el evento y recarga las fotos', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValue(1);
    const onEventChange = vi.fn();
    render(<PhotosTab event={event} onEventChange={onEventChange} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Publicar 1 aprobada(s)' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Quedan 1 foto(s) sin revisar'));
    expect(api.publishPhotoBatch).toHaveBeenCalledWith('ev-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Publicaste 1 foto(s).');
    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ photosRevealedAt: expect.any(String) }));
    await waitFor(() => expect(api.listEventPhotos).toHaveBeenCalledTimes(2));
  });

  it('no publica si cancela la confirmación', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar 1 aprobada(s)' }));
    expect(api.publishPhotoBatch).not.toHaveBeenCalled();
  });

  it('si publicar falla, lo dice', async () => {
    vi.mocked(api.publishPhotoBatch).mockRejectedValue(new Error('No pudimos publicar las fotos.'));
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar 1 aprobada(s)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos publicar las fotos.');
    // «Reintentar» solo relee la lista: ofrecerlo aquí haría creer que se vuelve a publicar.
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('si una recarga falla con la lista vacía no dice a la vez que no llegan fotos', async () => {
    vi.mocked(api.listEventPhotos).mockResolvedValueOnce([]).mockRejectedValue(new Error('sin red'));
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    await screen.findByText(/todavía no llegan fotos/i);

    // Abrir la revisión vuelve a pedir la lista, y esa lectura falla.
    await userEvent.click(screen.getByRole('button', { name: 'Abrir revisión de fotos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('sin red');
    expect(screen.queryByText(/todavía no llegan fotos/i)).not.toBeInTheDocument();
  });

  it('abre la revisión con las funciones de este evento, incluido publicar desde ahí', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValue(3);
    const onEventChange = vi.fn();
    render(<PhotosTab event={event} onEventChange={onEventChange} />);

    await userEvent.click(await screen.findByRole('button', { name: /Revisar/ }));
    await userEvent.click(screen.getByRole('button', { name: 'listar' }));
    await waitFor(() => expect(api.listEventPhotos).toHaveBeenLastCalledWith('ev-1'));

    await userEvent.click(screen.getByRole('button', { name: 'aprobar' }));
    expect(api.moderateEventPhoto).toHaveBeenCalledWith('p1', 'approved');

    await userEvent.click(screen.getByRole('button', { name: 'publicar lote' }));
    await waitFor(() => expect(api.publishPhotoBatch).toHaveBeenCalledWith('ev-1'));
    expect(onEventChange).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'cerrar' }));
    expect(screen.queryByTestId('moderation')).not.toBeInTheDocument();
  });

  it('mientras carga lo dice, en vez de quedarse en blanco', () => {
    vi.mocked(api.listEventPhotos).mockReturnValue(new Promise(() => undefined));
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando fotos/i);
  });

  it('sin fotos todavía lo explica y no muestra el resumen en cero', async () => {
    vi.mocked(api.listEventPhotos).mockResolvedValue([]);
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);

    expect(await screen.findByText(/todavía no llegan fotos/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 fotos ·/)).not.toBeInTheDocument();
  });

  it('si no puede cargar ofrece «Reintentar», que vuelve a pedir las fotos', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce([photo('a', 'pending')]);
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('1 fotos · 1 por revisar · 0 aprobadas · 0 rechazadas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra el error si no se pueden cargar las fotos', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValue(new Error('No pudimos cargar las fotos del evento.'));
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las fotos del evento.');
  });
});
