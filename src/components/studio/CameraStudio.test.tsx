import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockCtx } from '../../test/mockCanvas';

vi.mock('../../lib/cameraStudioApi', () => ({
  listFrames: vi.fn(),
  listStickers: vi.fn(),
  createFrame: vi.fn(),
  updateFrame: vi.fn(),
  deleteFrame: vi.fn(),
  reorderFrames: vi.fn(),
  addEmojiSticker: vi.fn(),
  addImageSticker: vi.fn(),
  setStickerEnabled: vi.fn(),
  deleteSticker: vi.fn(),
  getStickerPreviewUrl: vi.fn(),
  uploadFrameImage: vi.fn(),
}));
vi.mock('../../lib/organizerApi', () => ({ updateEvent: vi.fn() }));

import * as studio from '../../lib/cameraStudioApi';
import { updateEvent, type OrganizerEvent } from '../../lib/organizerApi';
import CameraStudio from './CameraStudio';
import { DESIGN_EDIT_QUERY } from '../../hooks/useCanEditDesigns';

const event: OrganizerEvent = {
  id: 'ev-1', slug: 'fiesta-abcd', name: 'Cumple de Ana', startsAt: null, location: null,
  accessMode: 'open', cameraUnlock: 'on_identify', rsvpEnabled: false,
  framesEnabled: true, stickersEnabled: true, defaultFrameId: null,
  photosRevealedAt: null, subtitle: null,
  theme: {},
  activationCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  createdAt: '2026-10-15T00:00:00Z',
};

const frame = (id: string, label: string, over: Partial<studio.EventFrame> = {}): studio.EventFrame => ({
  id, eventId: 'ev-1', template: 'capas', label, params: { layers: [] }, enabled: true, sortOrder: 0, ...over,
});

function setup(frames: studio.EventFrame[], ev: OrganizerEvent = event) {
  const onEventChange = vi.fn();
  render(<CameraStudio event={ev} onEventChange={onEventChange} />);
  return { onEventChange };
}

beforeEach(() => {
  for (const fn of Object.values(studio)) (fn as ReturnType<typeof vi.fn>).mockReset();
  vi.mocked(updateEvent).mockReset();
  vi.mocked(studio.listStickers).mockResolvedValue([]);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx().ctx);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

async function load(frames: studio.EventFrame[], ev?: OrganizerEvent) {
  vi.mocked(studio.listFrames).mockResolvedValue(frames);
  const result = setup(frames, ev);
  await screen.findByRole('region', { name: 'Marcos' });
  return result;
}

describe('CameraStudio: marcos', () => {
  it('lista los marcos con su plantilla, estado y vista previa', async () => {
    await load([frame('f1', 'Borde rosa'), frame('f2', 'Apagado', { enabled: false })]);
    expect(screen.getByText('Borde rosa')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Activo: Borde rosa' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Activo: Apagado' })).not.toBeChecked();
    expect(screen.getByRole('img', { name: 'Vista previa de Borde rosa' })).toBeInTheDocument();
  });

  it('sin marcos invita a crear el primero', async () => {
    await load([]);
    expect(screen.getByText(/Todavía no hay marcos/)).toBeInTheDocument();
  });

  it('activa o apaga un marco', async () => {
    vi.mocked(studio.updateFrame).mockResolvedValue(frame('f1', 'Borde rosa', { enabled: false }));
    await load([frame('f1', 'Borde rosa')]);
    await userEvent.click(screen.getByRole('switch', { name: 'Activo: Borde rosa' }));
    await waitFor(() => expect(studio.updateFrame).toHaveBeenCalledWith('f1', { enabled: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Activo: Borde rosa' })).not.toBeChecked());
  });

  it('el interruptor global de marcos actualiza el evento', async () => {
    vi.mocked(updateEvent).mockResolvedValue({ ...event, framesEnabled: false });
    const { onEventChange } = await load([]);
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar marcos a los invitados' }));
    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith('ev-1', { framesEnabled: false }));
    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ framesEnabled: false }));
  });

  it('el interruptor global de stickers actualiza el evento', async () => {
    vi.mocked(updateEvent).mockResolvedValue({ ...event, stickersEnabled: false });
    await load([]);
    await userEvent.click(screen.getByRole('switch', { name: 'Permitir stickers a los invitados' }));
    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith('ev-1', { stickersEnabled: false }));
  });

  it('marca un marco como el de por defecto, solo si está activo', async () => {
    vi.mocked(updateEvent).mockResolvedValue({ ...event, defaultFrameId: 'f1' });
    const { onEventChange } = await load([frame('f1', 'Borde rosa'), frame('f2', 'Apagado', { enabled: false })]);

    expect(screen.getByRole('button', { name: 'Usar Apagado por defecto' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Usar Borde rosa por defecto' }));
    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith('ev-1', { defaultFrameId: 'f1' }));
    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ defaultFrameId: 'f1' }));
  });

  it('indica cuál es el marco por defecto', async () => {
    await load([frame('f1', 'Borde rosa')], { ...event, defaultFrameId: 'f1' });
    expect(screen.getByText(/por defecto/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar Borde rosa por defecto' })).toBeDisabled();
  });

  it('reordena con ↑ ↓ y guarda el orden', async () => {
    vi.mocked(studio.reorderFrames).mockResolvedValue(undefined);
    await load([frame('f1', 'Primero'), frame('f2', 'Segundo')]);

    expect(screen.getByRole('button', { name: 'Subir Primero' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Segundo' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Subir Segundo' }));
    await waitFor(() => expect(studio.reorderFrames).toHaveBeenCalledWith(['f2', 'f1']));
    const names = within(screen.getByRole('region', { name: 'Marcos' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names[0]).toContain('Segundo');
  });

  it('crea un marco: abre el estudio con el nombre del evento y guarda las capas', async () => {
    vi.mocked(studio.createFrame).mockResolvedValue(frame('f9', 'Capas', { template: 'capas' }));
    await load([]);

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo marco' }));

    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar emoji' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));

    await waitFor(() => expect(studio.createFrame).toHaveBeenCalledTimes(1));
    const [, input, order] = vi.mocked(studio.createFrame).mock.calls[0];
    expect(input).toMatchObject({ template: 'capas', label: 'Capas' });
    expect(order).toBe(0);
    expect(input.params.layers).toHaveLength(2); // el nombre del evento y el emoji
    expect(input.params.layers?.[0]).toMatchObject({ type: 'text', text: 'Cumple de Ana' });
  });

  it('sube la imagen de una capa a la carpeta del evento y la guarda en el marco', async () => {
    const src = '123e4567-e89b-42d3-a456-426614174000/frames/abc.webp';
    vi.mocked(studio.uploadFrameImage).mockResolvedValue(src);
    vi.mocked(studio.createFrame).mockResolvedValue(frame('f9', 'Capas', { template: 'capas' }));
    await load([]);

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo marco' }));
    const file = new File(['x'], 'overlay.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Elegir imagen'), file);

    await waitFor(() => expect(studio.uploadFrameImage).toHaveBeenCalledWith('ev-1', file));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar marco' }));

    await waitFor(() => expect(studio.createFrame).toHaveBeenCalledTimes(1));
    const [, input] = vi.mocked(studio.createFrame).mock.calls[0];
    expect(input.params.layers).toContainEqual(expect.objectContaining({ type: 'image', src }));
  });

  it('edita un marco existente', async () => {
    vi.mocked(studio.updateFrame).mockResolvedValue(frame('f1', 'Renombrado', { params: { layers: [] } }));
    await load([frame('f1', 'Borde rosa')]);

    await userEvent.click(screen.getByRole('button', { name: 'Editar Borde rosa' }));
    const name = screen.getByLabelText(/Nombre del marco/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Renombrado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));

    await waitFor(() => expect(studio.updateFrame).toHaveBeenCalledWith('f1', expect.objectContaining({ label: 'Renombrado' })));
    expect(await screen.findByText('Renombrado')).toBeInTheDocument();
  });

  it('cancelar la edición vuelve a la lista sin guardar', async () => {
    await load([frame('f1', 'Borde rosa')]);
    await userEvent.click(screen.getByRole('button', { name: 'Editar Borde rosa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('region', { name: 'Marcos' })).toBeInTheDocument();
    expect(studio.updateFrame).not.toHaveBeenCalled();
  });

  it('duplica un marco', async () => {
    vi.mocked(studio.createFrame).mockResolvedValue(frame('f2', 'Borde rosa (copia)'));
    await load([frame('f1', 'Borde rosa')]);
    await userEvent.click(screen.getByRole('button', { name: 'Duplicar Borde rosa' }));
    await waitFor(() =>
      expect(studio.createFrame).toHaveBeenCalledWith(
        'ev-1',
        { template: 'capas', label: 'Borde rosa (copia)', params: { layers: [] } },
        1,
      ),
    );
    expect(await screen.findByText('Borde rosa (copia)')).toBeInTheDocument();
  });

  it('borra tras confirmar; si era el de por defecto, el evento queda sin uno', async () => {
    vi.mocked(studio.deleteFrame).mockResolvedValue(undefined);
    const { onEventChange } = await load([frame('f1', 'Borde rosa')], { ...event, defaultFrameId: 'f1' });

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar Borde rosa' }));
    expect(studio.deleteFrame).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Borrar Borde rosa' }));
    await waitFor(() => expect(studio.deleteFrame).toHaveBeenCalledWith('f1'));
    expect(onEventChange).toHaveBeenCalledWith(expect.objectContaining({ defaultFrameId: null }));
    await waitFor(() => expect(screen.queryByText('Borde rosa')).not.toBeInTheDocument());
  });

  it('muestra los errores de la base (p. ej. tope de marcos)', async () => {
    vi.mocked(studio.createFrame).mockRejectedValue(new Error('Llegaste al máximo de 20 marcos por evento.'));
    await load([]);
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo marco' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar marco' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('máximo de 20 marcos');
  });

  it('muestra el error si no se pueden cargar', async () => {
    vi.mocked(studio.listFrames).mockRejectedValue(new Error('No pudimos cargar los marcos.'));
    setup([]);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los marcos.');
  });
});

describe('CameraStudio: stickers', () => {
  it('agrega un emoji y lo muestra en la lista', async () => {
    vi.mocked(studio.addEmojiSticker).mockResolvedValue({
      id: 's1', eventId: 'ev-1', kind: 'emoji', emoji: '🥳', storagePath: null, enabled: true, sortOrder: 0,
    });
    await load([]);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar 🥳' }));
    await waitFor(() => expect(studio.addEmojiSticker).toHaveBeenCalledWith('ev-1', '🥳', 0));
    expect(await screen.findByRole('switch', { name: 'Activo: 🥳' })).toBeChecked();
  });

  it('apaga y borra stickers existentes', async () => {
    const existing: studio.EventSticker = { id: 's1', eventId: 'ev-1', kind: 'emoji', emoji: '🎉', storagePath: null, enabled: true, sortOrder: 0 };
    vi.mocked(studio.listStickers).mockResolvedValue([existing]);
    vi.mocked(studio.setStickerEnabled).mockResolvedValue({ ...existing, enabled: false });
    vi.mocked(studio.deleteSticker).mockResolvedValue(undefined);
    await load([]);

    await userEvent.click(await screen.findByRole('switch', { name: 'Activo: 🎉' }));
    await waitFor(() => expect(studio.setStickerEnabled).toHaveBeenCalledWith('s1', false));

    await userEvent.click(screen.getByRole('button', { name: 'Borrar 🎉' }));
    await waitFor(() => expect(studio.deleteSticker).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' })));
    await waitFor(() => expect(screen.queryByRole('switch', { name: 'Activo: 🎉' })).not.toBeInTheDocument());
  });
});

const NOTICE = 'Para editar los diseños, entra desde un computador';

/** matchMedia falso: la consulta de edición coincide o no, y se puede cambiar con el componente montado. */
function stubEditQuery(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  let matches = initial;
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === DESIGN_EDIT_QUERY && matches;
    },
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  }));
  return (next: boolean) => {
    matches = next;
    act(() => listeners.forEach((cb) => cb({ matches: next })));
  };
}

describe('CameraStudio: edición solo en computador', () => {
  afterEach(() => vi.unstubAllGlobals());

  const existing: studio.EventSticker = { id: 's1', eventId: 'ev-1', kind: 'emoji', emoji: '🎉', storagePath: null, enabled: true, sortOrder: 0 };

  it('en un computador no muestra el aviso y deja editar', async () => {
    stubEditQuery(true);
    await load([frame('f1', 'Borde rosa')]);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Borde rosa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo marco' })).toBeInTheDocument();
  });

  it('en un celular muestra los diseños en solo lectura con el aviso', async () => {
    stubEditQuery(false);
    vi.mocked(studio.listStickers).mockResolvedValue([existing]);
    await load([frame('f1', 'Borde rosa'), frame('f2', 'Segundo')]);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vista previa de Borde rosa' })).toBeInTheDocument();
    expect(screen.getByText('Borde rosa')).toBeInTheDocument();

    for (const name of [
      'Nuevo marco', 'Editar Borde rosa', 'Duplicar Borde rosa', 'Borrar Borde rosa',
      'Subir Segundo', 'Bajar Borde rosa', 'Agregar 🥳', 'Subir imagen', 'Borrar 🎉',
    ]) {
      expect(screen.queryByRole('button', { name }), name).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Elegir imagen')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lienzo del marco')).not.toBeInTheDocument();
  });

  it('en un celular siguen los interruptores y «Por defecto»: no cambian el diseño', async () => {
    stubEditQuery(false);
    vi.mocked(studio.updateFrame).mockResolvedValue(frame('f1', 'Borde rosa', { enabled: false }));
    vi.mocked(updateEvent).mockResolvedValue({ ...event, defaultFrameId: 'f1' });
    await load([frame('f1', 'Borde rosa')]);

    await userEvent.click(screen.getByRole('switch', { name: 'Activo: Borde rosa' }));
    await waitFor(() => expect(studio.updateFrame).toHaveBeenCalledWith('f1', { enabled: false }));
    expect(screen.getByRole('switch', { name: 'Mostrar marcos a los invitados' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Permitir stickers a los invitados' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar Borde rosa por defecto' })).toBeInTheDocument();
  });

  it('en un celular, sin stickers, no manda a «agregar algunos arriba»', async () => {
    stubEditQuery(false);
    await load([]);
    expect(screen.queryByText(/Agrega algunos arriba/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Crea el primero/)).not.toBeInTheDocument();
  });

  it('si la ventana se achica con el editor abierto, el editor se desmonta', async () => {
    const setEditable = stubEditQuery(true);
    await load([frame('f1', 'Borde rosa')]);
    await userEvent.click(screen.getByRole('button', { name: 'Editar Borde rosa' }));
    expect(screen.getByLabelText(/Nombre del marco/)).toBeInTheDocument();

    setEditable(false);
    expect(screen.queryByLabelText(/Nombre del marco/)).not.toBeInTheDocument();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('al volver a agrandar la ventana el editor no reaparece solo', async () => {
    const setEditable = stubEditQuery(true);
    await load([frame('f1', 'Borde rosa')]);
    await userEvent.click(screen.getByRole('button', { name: 'Editar Borde rosa' }));

    setEditable(false);
    setEditable(true);

    expect(screen.queryByLabelText(/Nombre del marco/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Borde rosa' })).toBeInTheDocument();
  });

  it('al volver a agrandar la ventana el estudio no reaparece abierto', async () => {
    const setEditable = stubEditQuery(true);
    await load([]);
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo marco' }));
    expect(screen.getByLabelText('Lienzo del marco')).toBeInTheDocument();

    setEditable(false);
    setEditable(true);

    expect(screen.queryByLabelText('Lienzo del marco')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nuevo marco' })).toBeInTheDocument();
  });

  it('el aviso se anuncia a los lectores de pantalla', async () => {
    stubEditQuery(false);
    await load([]);
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
  });
});

describe('CameraStudio: carga', () => {
  it('mientras carga lo dice con role="status"', () => {
    vi.mocked(studio.listFrames).mockReturnValue(new Promise(() => undefined));
    setup([]);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('si no carga ofrece «Reintentar», que vuelve a pedir marcos y stickers', async () => {
    vi.mocked(studio.listFrames).mockRejectedValueOnce(new Error('No pudimos cargar la cámara.')).mockResolvedValueOnce([frame('f1', 'Borde rosa')]);
    setup([]);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la cámara.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Borde rosa')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
