import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// El carrusel y el rollo importan photosApi, que crea el cliente de Supabase: en el test no hay base.
vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('../lib/organizerApi', () => ({ getMyEvent: vi.fn() }));
vi.mock('../lib/previewCameraAssets', () => ({
  listPreviewCameraAssets: vi.fn().mockResolvedValue({ frames: [], stickers: [] }),
}));
vi.mock('../lib/postsApi', () => ({
  listAllPosts: vi.fn(),
  listPostImages: vi.fn().mockResolvedValue([]),
  getPostImageUrl: vi.fn().mockResolvedValue('https://signed.example/img.jpg'),
}));
vi.mock('../lib/platformApi', async () => {
  class EnrollmentAnswersError extends Error {
    constructor(readonly code: string) {
      super('Revisa tus respuestas e intenta de nuevo.');
    }
  }
  return { registerGuest: vi.fn(), loginGuest: vi.fn(), EnrollmentAnswersError };
});

import { supabase } from '../lib/supabaseClient';
import { getMyEvent, type OrganizerEvent } from '../lib/organizerApi';
import { getPostImageUrl, listAllPosts, listPostImages } from '../lib/postsApi';
import { listPreviewCameraAssets } from '../lib/previewCameraAssets';
import { loginGuest, registerGuest } from '../lib/platformApi';
import { emptyEnrollment } from '../lib/enrollmentConfig';
import { THEME_PRESETS, hexToChannels } from '../lib/theme';
import type { Post } from '../types';
import GuestPreviewPage from './GuestPreviewPage';

const SECRET = 'SECRETO-DEL-QR-1234';
let postMessageSpy: ReturnType<typeof vi.spyOn>;

const event = {
  id: 'ev-1',
  slug: 'puti-halloween',
  name: 'PUTI HALLOWEEN',
  startsAt: '2026-10-30T23:00:00Z',
  location: 'Casa de Fran',
  accessMode: 'open',
  cameraUnlock: 'on_event_qr',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: 'Cumpleaños Fran',
  theme: { preset: 'rosa-chicle' },
  activationCode: SECRET,
  defaultPhotoQuota: 5,
  enrollment: emptyEnrollment(),
  createdAt: '2026-10-01T00:00:00Z',
} as unknown as OrganizerEvent;

function post(id: string, title: string, publishedAt: string | null): Post {
  return { id, title, subtitle: null, body: `Cuerpo ${id}`, coverImagePath: null, publishedAt, createdAt: '2026-10-20T00:00:00Z' };
}

function renderAt(path = '/panel/e/ev-1/vista-previa') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/panel/e/:eventId/vista-previa" element={<GuestPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function send(data: unknown, origin = window.location.origin) {
  act(() => {
    fireEvent(window, new MessageEvent('message', { data, origin, source: window }));
  });
}

beforeEach(() => {
  vi.mocked(getMyEvent).mockReset().mockResolvedValue(event);
  vi.mocked(listPreviewCameraAssets).mockReset().mockResolvedValue({ frames: [], stickers: [] });
  vi.mocked(listAllPosts)
    .mockReset()
    .mockResolvedValue([post('a', 'Cambio de hora', '2025-10-25T12:00:00Z'), post('b', 'Borrador secreto', null)]);
  vi.mocked(listPostImages).mockReset().mockResolvedValue([]);
  vi.mocked(getPostImageUrl).mockClear();
  vi.mocked(registerGuest).mockReset();
  vi.mocked(loginGuest).mockReset();
  if (supabase.from && vi.isMockFunction(supabase.from)) vi.mocked(supabase.from).mockReset();
  if (supabase.rpc && vi.isMockFunction(supabase.rpc)) vi.mocked(supabase.rpc).mockReset();
  if (supabase.storage?.from && vi.isMockFunction(supabase.storage.from)) vi.mocked(supabase.storage.from).mockReset();
  postMessageSpy = vi.spyOn(window, 'postMessage');
});

afterEach(() => {
  postMessageSpy.mockRestore();
});

describe('GuestPreviewPage', () => {
  it('por defecto muestra al invitado de ejemplo con la cámara activa', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Hola, Ana');
    expect(screen.getByText('PUTI HALLOWEEN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
  });

  it('con un estilo en el mensaje, pinta ese preset y no el guardado en el evento', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1 });
    const bg = () => document.documentElement.style.getPropertyValue('--c-ink-950');
    const neon = THEME_PRESETS.find((p) => p.id === 'neon')!;
    const rosa = THEME_PRESETS.find((p) => p.id === 'rosa-chicle')!;
    expect(bg()).toBe(hexToChannels(rosa.colors.bg));

    send({ type: 'fcumple-preview', state: 'activa', draft: null, themeId: 'neon' });
    await waitFor(() => expect(bg()).toBe(hexToChannels(neon.colors.bg)));

    send({ type: 'fcumple-preview', state: 'activa', draft: null, themeId: null });
    await waitFor(() => expect(bg()).toBe(hexToChannels(rosa.colors.bg)));
  });

  it('un mensaje con un estilo inventado se ignora y se conserva el que se veía', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1 });

    send({ type: 'fcumple-preview', state: 'activa', draft: null, themeId: '#00ff00' });

    const rosa = THEME_PRESETS.find((p) => p.id === 'rosa-chicle')!;
    expect(document.documentElement.style.getPropertyValue('--c-ink-950')).toBe(hexToChannels(rosa.colors.bg));
  });

  it('nunca pone el código de activación en la página', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1 });

    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('muestra solo los avisos publicados', async () => {
    renderAt('/panel/e/ev-1/vista-previa?estado=avisos');

    expect(await screen.findByText('Cambio de hora')).toBeInTheDocument();
    expect(screen.queryByText('Borrador secreto')).not.toBeInTheDocument();
  });

  it('no muestra un aviso programado a futuro: el invitado todavía no lo ve', async () => {
    vi.mocked(listAllPosts).mockResolvedValue([
      post('a', 'Cambio de hora', '2025-10-25T12:00:00Z'),
      post('f', 'Aviso del futuro', '2999-01-01T00:00:00Z'),
    ]);
    renderAt('/panel/e/ev-1/vista-previa?estado=avisos');

    expect(await screen.findByText('Cambio de hora')).toBeInTheDocument();
    expect(screen.queryByText('Aviso del futuro')).not.toBeInTheDocument();
  });

  it('al escribir en el borrador no vuelve a pedir las imágenes de la galería', async () => {
    renderAt();
    await screen.findByRole('button', { name: 'Abrir cámara' });
    const draft = (title: string) => ({
      type: 'fcumple-preview',
      state: 'aviso',
      draft: { title, subtitle: null, body: 'B', coverImagePath: null, galleryPaths: ['ev-1/g1.jpg', 'ev-1/g2.jpg'] },
    });

    send(draft('P'));
    await screen.findByText('P');
    await waitFor(() => expect(getPostImageUrl).toHaveBeenCalledTimes(2));
    send(draft('Pi'));
    send(draft('Piz'));
    await screen.findByText('Piz');

    expect(getPostImageUrl).toHaveBeenCalledTimes(2);
  });

  it('lee el estado de la dirección', async () => {
    renderAt('/panel/e/ev-1/vista-previa?estado=bloqueada');

    expect(await screen.findByLabelText('Cámara bloqueada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir cámara' })).not.toBeInTheDocument();
  });

  it('cambia de estado cuando el marco lo pide', async () => {
    renderAt();
    await screen.findByRole('button', { name: 'Abrir cámara' });

    send({ type: 'fcumple-preview', state: 'agotado', draft: null });

    expect(await screen.findByText(/se acabó tu rollo/i)).toBeInTheDocument();
  });

  it('ignora los mensajes de otro origen y los que no entiende', async () => {
    renderAt();
    await screen.findByRole('button', { name: 'Abrir cámara' });

    send({ type: 'fcumple-preview', state: 'agotado', draft: null }, 'https://otro.example');
    send({ type: 'fcumple-preview', state: 'admin', draft: null });
    send('hola');

    expect(screen.getByRole('button', { name: 'Abrir cámara' })).toBeInTheDocument();
  });

  it('al recibir un refresco vuelve a leer los avisos: lo recién publicado aparece y lo despublicado se va', async () => {
    renderAt();
    await screen.findByText('Cambio de hora');
    vi.mocked(listAllPosts).mockResolvedValue([
      post('a', 'Cambio de hora', null),
      post('b', 'Borrador secreto', '2025-10-26T12:00:00Z'),
    ]);

    send({ type: 'fcumple-preview-refresh' });

    expect(await screen.findByText('Borrador secreto')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Cambio de hora')).not.toBeInTheDocument());
  });

  it('el refresco no vuelve a la pantalla de carga ni cambia el estado que se ve', async () => {
    renderAt('/panel/e/ev-1/vista-previa?estado=bloqueada');
    await screen.findByLabelText('Cámara bloqueada');
    vi.mocked(listAllPosts).mockClear();

    send({ type: 'fcumple-preview-refresh' });

    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    await waitFor(() => expect(listAllPosts).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Cámara bloqueada')).toBeInTheDocument();
  });

  it('si el refresco falla conserva lo que ya mostraba', async () => {
    renderAt();
    await screen.findByText('Cambio de hora');
    vi.mocked(listAllPosts).mockRejectedValue(new Error('sin red'));

    send({ type: 'fcumple-preview-refresh' });

    await waitFor(() => expect(listAllPosts).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Cambio de hora')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si dos refrescos se cruzan, gana el último aunque la respuesta del primero llegue después', async () => {
    renderAt();
    await screen.findByText('Cambio de hora');
    let resolveOld!: (posts: Post[]) => void;
    let resolveNew!: (posts: Post[]) => void;
    vi.mocked(listAllPosts)
      .mockReturnValueOnce(new Promise<Post[]>((r) => (resolveOld = r)))
      .mockReturnValueOnce(new Promise<Post[]>((r) => (resolveNew = r)));

    send({ type: 'fcumple-preview-refresh' });
    send({ type: 'fcumple-preview-refresh' });
    await act(async () => resolveNew([post('n', 'Aviso nuevo', '2025-10-26T12:00:00Z')]));
    await act(async () => resolveOld([post('v', 'Aviso viejo', '2025-10-26T12:00:00Z')]));

    expect(await screen.findByText('Aviso nuevo')).toBeInTheDocument();
    expect(screen.queryByText('Aviso viejo')).not.toBeInTheDocument();
  });

  it('ignora un refresco que no viene de la ventana que la contiene', async () => {
    renderAt();
    await screen.findByText('Cambio de hora');
    vi.mocked(listAllPosts).mockClear();

    act(() => {
      fireEvent(
        window,
        new MessageEvent('message', {
          data: { type: 'fcumple-preview-refresh' },
          origin: window.location.origin,
          source: null,
        }),
      );
    });

    expect(listAllPosts).not.toHaveBeenCalled();
  });

  it('ignora un refresco de otro origen', async () => {
    renderAt();
    await screen.findByText('Cambio de hora');
    vi.mocked(listAllPosts).mockClear();

    send({ type: 'fcumple-preview-refresh' }, 'https://otro.example');

    expect(listAllPosts).not.toHaveBeenCalled();
  });

  it('muestra el aviso en borrador entre los publicados', async () => {
    renderAt();
    await screen.findByRole('button', { name: 'Abrir cámara' });

    send({
      type: 'fcumple-preview',
      state: 'aviso',
      draft: { title: 'Pizza a las 22:00', subtitle: null, body: 'Traigan hambre', coverImagePath: null, galleryPaths: [] },
    });

    expect(await screen.findByText('Pizza a las 22:00')).toBeInTheDocument();
    expect(screen.getByText('Cambio de hora')).toBeInTheDocument();
  });

  it('la inscripción se ve pero no se envía', async () => {
    renderAt('/panel/e/ev-1/vista-previa?estado=inscripcion');

    await userEvent.type(await screen.findByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText(/Elige un PIN/), '4821');
    await userEvent.type(screen.getByLabelText('Repite tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(registerGuest).not.toHaveBeenCalled();
    expect(loginGuest).not.toHaveBeenCalled();
  });

  it('avisa al marco que está lista para recibir el estado', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1 });

    expect(window.postMessage).toHaveBeenCalledWith({ type: 'fcumple-preview-ready' }, window.location.origin);
  });

  it('le cuenta al marco la nota del estado que se ve', async () => {
    vi.mocked(listAllPosts).mockResolvedValue([]);
    renderAt('/panel/e/ev-1/vista-previa?estado=avisos');
    await screen.findByRole('heading', { level: 1 });

    await waitFor(() =>
      expect(window.postMessage).toHaveBeenCalledWith(
        { type: 'fcumple-preview-note', note: expect.stringMatching(/no has publicado/i) },
        window.location.origin,
      ),
    );
  });

  it('avisa si el evento no existe o no es de quien mira', async () => {
    vi.mocked(getMyEvent).mockResolvedValue(null);
    renderAt();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no existe o no es tuyo/i);
  });

  it('avisa si no se pudo cargar el evento', async () => {
    vi.mocked(getMyEvent).mockRejectedValue(new Error('No pudimos cargar el evento.'));
    renderAt();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el evento.');
  });

  it('abre la cámara real en vista previa, cargando los recursos solo al abrir y sin guardar fotos en supabase', async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const prevCreateObjectURL = URL.createObjectURL;
    const prevRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-photo');
    URL.revokeObjectURL = vi.fn();

    const vWidthSpy = vi.spyOn(window.HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    const vHeightSpy = vi.spyOn(window.HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    const ctxSpy = vi
      .spyOn(window.HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toBlobSpy = vi
      .spyOn(window.HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => {
        callback(new Blob(['fake-jpeg'], { type: 'image/jpeg' }));
      });

    const track = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({})),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia },
    });

    try {
      renderAt();
      await screen.findByRole('heading', { level: 1 });

      // 1. Los recursos NO se cargan al montar la página
      expect(listPreviewCameraAssets).not.toHaveBeenCalled();

      // 2. Al hacer clic en "Abrir cámara", se abre y se leen los marcos/stickers
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Abrir cámara' }));

      expect(await screen.findByText('Vista previa: las fotos no se guardan')).toBeInTheDocument();
      expect(listPreviewCameraAssets).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev-1' }));

      // 3. Cupo local arranca en 0 usados (muestra los 5 disparos restantes)
      expect(screen.getByText('5')).toBeInTheDocument();

      // 4. Tomar y enviar foto NO llama a Supabase (ni storage, ni RPC, ni tabla)
      const shutter = await screen.findByRole('button', { name: /disparar/i });
      await waitFor(() => expect(shutter).toBeEnabled());
      await user.click(shutter);

      const sendBtn = await screen.findByRole('button', { name: /enviar/i });
      await user.click(sendBtn);

      expect(await screen.findByText(/quedó en el rollo/i)).toBeInTheDocument();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.storage.from).not.toHaveBeenCalled();

      // 5. Cerrar y volver a abrir reinicia el cupo local a 0 usados (vuelve a 5 restantes)
      await user.click(screen.getByRole('button', { name: /cerrar/i }));
      expect(screen.queryByText('Vista previa: las fotos no se guardan')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Abrir cámara' }));
      expect(await screen.findByText('Vista previa: las fotos no se guardan')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    } finally {
      playSpy.mockRestore();
      vWidthSpy.mockRestore();
      vHeightSpy.mockRestore();
      ctxSpy.mockRestore();
      toBlobSpy.mockRestore();
      URL.createObjectURL = prevCreateObjectURL;
      URL.revokeObjectURL = prevRevokeObjectURL;
      vi.unstubAllGlobals();
    }
  });
});
