import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// El carrusel y el rollo importan photosApi, que crea el cliente de Supabase: en el test no hay base.
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../lib/organizerApi', () => ({ getMyEvent: vi.fn() }));
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

import { getMyEvent, type OrganizerEvent } from '../lib/organizerApi';
import { getPostImageUrl, listAllPosts, listPostImages } from '../lib/postsApi';
import { loginGuest, registerGuest } from '../lib/platformApi';
import { emptyEnrollment } from '../lib/enrollmentConfig';
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
  vi.mocked(listAllPosts)
    .mockReset()
    .mockResolvedValue([post('a', 'Cambio de hora', '2025-10-25T12:00:00Z'), post('b', 'Borrador secreto', null)]);
  vi.mocked(listPostImages).mockReset().mockResolvedValue([]);
  vi.mocked(getPostImageUrl).mockClear();
  vi.mocked(registerGuest).mockReset();
  vi.mocked(loginGuest).mockReset();
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
});
