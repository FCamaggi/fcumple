import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/platformGuestApi', () => ({
  listPublishedPosts: vi.fn(),
  getPublicHeadcount: vi.fn(),
  listRevealedPhotosForGuest: vi.fn(),
  uploadGuestPhoto: vi.fn(),
}));
vi.mock('../lib/photosApi', () => ({ getPhotoQuota: vi.fn() }));
vi.mock('../hooks/useCameraAssets', () => ({ useCameraAssets: vi.fn() }));
vi.mock('../lib/platformApi', () => ({ getMyGuest: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') } }));
vi.mock('./AnnouncementFeed', () => ({
  default: ({ posts }: { posts: Array<{ title: string }> }) => (
    <div data-testid="feed">{posts.map((p) => p.title).join(',')}</div>
  ),
}));
vi.mock('./PhotoCarousel', () => ({
  default: ({ photos }: { photos: unknown[] }) => <div data-testid="carousel">{photos.length}</div>,
}));
vi.mock('./RevealedRoll', () => ({
  default: ({ photos }: { photos: unknown[] }) => <div data-testid="roll">{photos.length}</div>,
}));
vi.mock('./CameraCapture', () => ({
  default: ({
    onClose,
    upload,
    frames,
    stickers,
    initialFrameId,
  }: {
    onClose: () => void;
    upload?: unknown;
    frames?: unknown[];
    stickers?: unknown[];
    initialFrameId?: string | null;
  }) => (
    <div
      data-testid="camera"
      data-has-upload={String(typeof upload === 'function')}
      data-frames={frames?.length}
      data-stickers={stickers?.length}
      data-initial-frame={initialFrameId ?? ''}
    >
      <button type="button" onClick={onClose}>
        cerrar cámara
      </button>
    </div>
  ),
}));

import QRCode from 'qrcode';
import { getPhotoQuota } from '../lib/photosApi';
import { useCameraAssets } from '../hooks/useCameraAssets';
import { getMyGuest, type EventPublic, type MyGuest } from '../lib/platformApi';
import { getPublicHeadcount, listPublishedPosts, listRevealedPhotosForGuest } from '../lib/platformGuestApi';
import GuestHub from './GuestHub';

const event: EventPublic = {
  id: 'ev-1',
  name: 'Cumple',
  startsAt: null,
  location: null,
  rsvpDeadline: null,
  accessMode: 'list',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealed: false,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  subtitle: null,
  theme: {},
};

const guest: MyGuest = { id: 'g1', eventId: 'ev-1', fullName: 'Ana Rojas', checkedInAt: null, photoQuota: 5, cameraActivatedAt: null };

function setup(overrides: { event?: Partial<EventPublic>; guest?: Partial<MyGuest> } = {}) {
  const onGuestChange = vi.fn();
  render(
    <GuestHub
      slug="fiesta-abcd"
      token="tok"
      event={{ ...event, ...overrides.event }}
      guest={{ ...guest, ...overrides.guest }}
      onGuestChange={onGuestChange}
    />,
  );
  return { onGuestChange };
}

const readyAssets = {
  status: 'ready' as const,
  frames: [{ id: 'f1', label: 'Borde', draw: null }],
  stickers: [{ id: 's1', label: '🎉', asset: { kind: 'emoji' as const, emoji: '🎉' } }],
  initialFrameId: 'f1',
};

beforeEach(() => {
  vi.mocked(useCameraAssets).mockReset().mockReturnValue(readyAssets);
  vi.mocked(listPublishedPosts).mockReset().mockResolvedValue([]);
  vi.mocked(getPublicHeadcount).mockReset().mockResolvedValue(0);
  vi.mocked(listRevealedPhotosForGuest).mockReset().mockResolvedValue([]);
  vi.mocked(getPhotoQuota).mockReset().mockResolvedValue({ quota: 5, used: 1 });
  vi.mocked(getMyGuest).mockReset();
  vi.mocked(QRCode.toDataURL).mockClear();
});

describe('GuestHub', () => {
  it('carga los avisos del evento por slug', async () => {
    vi.mocked(listPublishedPosts).mockResolvedValue([{ id: 'a', title: 'Aviso 1' } as never]);
    setup();
    await waitFor(() => expect(screen.getByTestId('feed')).toHaveTextContent('Aviso 1'));
    expect(listPublishedPosts).toHaveBeenCalledWith('fiesta-abcd');
  });

  it('con camera_unlock = on_identify muestra la cámara con el cupo y abre la cámara con la subida de la Fase 1', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
    expect(getPhotoQuota).toHaveBeenCalledWith('tok');

    await userEvent.click(screen.getByRole('button', { name: 'Abrir cámara' }));
    const camera = screen.getByTestId('camera');
    expect(camera).toHaveAttribute('data-has-upload', 'true');
    // La cámara abre con los marcos y stickers del evento y su marco por defecto.
    expect(camera).toHaveAttribute('data-frames', '1');
    expect(camera).toHaveAttribute('data-stickers', '1');
    expect(camera).toHaveAttribute('data-initial-frame', 'f1');

    await userEvent.click(screen.getByRole('button', { name: 'cerrar cámara' }));
    expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
  });

  it('con on_checkin y sin llegada marcada bloquea la cámara y no pide el cupo', async () => {
    setup({ event: { cameraUnlock: 'on_checkin' } });
    expect(await screen.findByText(/aún bloqueada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir cámara' })).not.toBeInTheDocument();
    expect(getPhotoQuota).not.toHaveBeenCalled();
  });

  it('muestra el código de puerta con el token y se puede cerrar', async () => {
    setup({ event: { cameraUnlock: 'on_checkin' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar mi código' }));

    expect(await screen.findByAltText('Código QR para la puerta')).toBeInTheDocument();
    expect(QRCode.toDataURL).toHaveBeenCalledWith('tok', expect.anything());

    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Ya me escanearon" vuelve a consultar al invitado y avisa el cambio', async () => {
    const checkedIn = { ...guest, checkedInAt: '2026-10-15T22:00:00Z' };
    vi.mocked(getMyGuest).mockResolvedValueOnce(checkedIn);
    const { onGuestChange } = setup({ event: { cameraUnlock: 'on_checkin' } });

    await userEvent.click(await screen.findByRole('button', { name: 'Ya me escanearon' }));

    await waitFor(() => expect(onGuestChange).toHaveBeenCalledWith(checkedIn));
    expect(getMyGuest).toHaveBeenCalledWith('tok');
  });

  it('con on_checkin y la llegada ya marcada habilita la cámara', async () => {
    setup({ event: { cameraUnlock: 'on_checkin' }, guest: { checkedInAt: '2026-10-15T22:00:00Z' } });
    expect(await screen.findByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
  });

  it('siempre pide las fotos publicadas: la organizadora puede publicar con la página abierta', async () => {
    setup();
    await waitFor(() => expect(listRevealedPhotosForGuest).toHaveBeenCalledWith('tok'));
  });

  it('muestra las fotos publicadas en el carrusel y en el rollo', async () => {
    vi.mocked(listRevealedPhotosForGuest).mockResolvedValue([
      { storagePath: 'ev/g/a.jpg', displayStoragePath: null, createdAt: '2026-10-15T01:00:00Z' },
    ]);
    setup();
    await waitFor(() => expect(screen.getByTestId('carousel')).toHaveTextContent('1'));
    expect(screen.getByTestId('roll')).toHaveTextContent('1');
  });

  it('vuelve a pedir las fotos cada minuto mientras la página está a la vista, y deja de hacerlo al salir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { unmount } = render(
        <GuestHub slug="fiesta-abcd" token="tok" event={event} guest={guest} onGuestChange={vi.fn()} />,
      );
      await waitFor(() => expect(listRevealedPhotosForGuest).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(listRevealedPhotosForGuest).toHaveBeenCalledTimes(2);
      unmount();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(listRevealedPhotosForGuest).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('cámara con el QR de la fiesta (on_event_qr)', () => {
    it('bloquea la cámara y explica que hay que escanear el QR de la fiesta, sin pedir el código de puerta', async () => {
      setup({ event: { cameraUnlock: 'on_event_qr' } });
      expect(await screen.findByText(/Escanea el código QR de la fiesta/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Abrir cámara' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mostrar mi código' })).not.toBeInTheDocument();
      expect(getPhotoQuota).not.toHaveBeenCalled();
    });

    it('marcar la llegada NO la habilita: la base exige el QR', async () => {
      setup({ event: { cameraUnlock: 'on_event_qr' }, guest: { checkedInAt: '2026-10-15T22:00:00Z' } });
      expect(await screen.findByText(/Escanea el código QR de la fiesta/)).toBeInTheDocument();
    });

    it('con la cámara ya activada se abre', async () => {
      setup({ event: { cameraUnlock: 'on_event_qr' }, guest: { cameraActivatedAt: '2026-10-30T23:40:00Z' } });
      expect(await screen.findByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
    });

    it('«Ya escaneé el código» vuelve a consultar al invitado', async () => {
      const activated = { ...guest, cameraActivatedAt: '2026-10-30T23:40:00Z' };
      vi.mocked(getMyGuest).mockResolvedValueOnce(activated);
      const { onGuestChange } = setup({ event: { cameraUnlock: 'on_event_qr' } });
      await userEvent.click(await screen.findByRole('button', { name: 'Ya escaneé el código' }));
      await waitFor(() => expect(onGuestChange).toHaveBeenCalledWith(activated));
    });

    it('con on_identify no pide ningún QR', async () => {
      setup({ event: { cameraUnlock: 'on_identify' } });
      expect(await screen.findByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
      expect(screen.queryByText(/Escanea el código QR de la fiesta/)).not.toBeInTheDocument();
    });
  });

  it('muestra el aforo cuando hay inscritos', async () => {
    vi.mocked(getPublicHeadcount).mockResolvedValue(12);
    setup();
    expect(await screen.findByText('Aforo // 12 inscritos')).toBeInTheDocument();
  });

  it('no ofrece la cámara hasta que los marcos y stickers terminaron de cargar', async () => {
    vi.mocked(useCameraAssets).mockReturnValue({ status: 'loading', frames: [], stickers: [], initialFrameId: null });
    setup();
    await waitFor(() => expect(getPhotoQuota).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Abrir cámara' })).not.toBeInTheDocument();
  });

  it('si fallan los marcos y stickers, la cámara se ofrece igual (sin ellos)', async () => {
    vi.mocked(useCameraAssets).mockReturnValue({ status: 'error', frames: [], stickers: [], initialFrameId: null });
    setup();
    expect(await screen.findByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
  });

  it('solo carga los marcos y stickers cuando la cámara está desbloqueada', async () => {
    setup({ event: { cameraUnlock: 'on_checkin' } });
    await screen.findByText(/aún bloqueada/);
    expect(useCameraAssets).toHaveBeenCalledWith('tok', false);
  });
});
