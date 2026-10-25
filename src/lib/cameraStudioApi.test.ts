import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chain } from '../test/supabaseChain';

const storageUpload = vi.fn();
const storageRemove = vi.fn();
const storageSign = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: storageUpload, remove: storageRemove, createSignedUrl: storageSign })) },
  },
}));
vi.mock('./cameraAssets/stickers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cameraAssets/stickers')>()),
  processStickerImage: vi.fn(),
}));

import { supabase } from './supabaseClient';
import { FRAME_IMAGE_LIMITS, processStickerImage } from './cameraAssets/stickers';
import {
  addEmojiSticker,
  addImageSticker,
  createFrame,
  deleteFrame,
  deleteSticker,
  getStickerPreviewUrl,
  listFrames,
  listStickers,
  reorderFrames,
  setStickerEnabled,
  updateFrame,
  uploadFrameImage,
} from './cameraStudioApi';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

const frameRow = {
  id: 'f1',
  event_id: 'ev-1',
  template: 'capas',
  label: 'Título',
  params: { primaryColor: '#111111', title: 'Hola', hack: 'x' },
  enabled: true,
  sort_order: 2,
};

const stickerRow = {
  id: 's1',
  event_id: 'ev-1',
  kind: 'emoji',
  emoji: '🎉',
  storage_path: null,
  enabled: true,
  sort_order: 0,
};

beforeEach(() => {
  from.mockReset();
  storageUpload.mockReset().mockResolvedValue({ error: null });
  storageRemove.mockReset().mockResolvedValue({ error: null });
  storageSign.mockReset();
  vi.mocked(processStickerImage).mockReset();
});

describe('marcos', () => {
  it('listFrames filtra por evento, ordena y limpia parámetros ajenos', async () => {
    const q = chain({ data: [frameRow], error: null });
    from.mockReturnValueOnce(q.proxy);
    const frames = await listFrames('ev-1');
    expect(from).toHaveBeenCalledWith('event_frames');
    expect(q.call('eq')).toEqual(['event_id', 'ev-1']);
    expect(frames[0]).toMatchObject({ id: 'f1', template: 'capas', sortOrder: 2 });
    expect(frames[0].params).toEqual({ primaryColor: '#111111', title: 'Hola' });
  });

  it('createFrame valida antes de enviar y devuelve el marco', async () => {
    const q = chain({ data: frameRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await createFrame('ev-1', { template: 'capas', label: '  Título ', params: { title: 'Hola' } }, 3);
    expect(q.call('insert')![0]).toEqual({
      event_id: 'ev-1',
      template: 'capas',
      label: 'Título',
      params: { title: 'Hola' },
      sort_order: 3,
    });
  });

  it('createFrame rechaza parámetros inválidos y etiquetas vacías sin llamar a la base', async () => {
    await expect(createFrame('ev-1', { template: 'capas', label: 'x', params: { primaryColor: 'rojo' } })).rejects.toThrow(/#RRGGBB/);
    await expect(createFrame('ev-1', { template: 'capas', label: '   ', params: {} })).rejects.toThrow(/nombre al marco/);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ['53400', /máximo de 20 marcos/],
    ['42501', /permiso/],
    ['23514', /no son válidos/],
    ['XX000', /No pudimos guardar el marco/],
  ])('createFrame traduce el código %s', async (code, message) => {
    from.mockReturnValueOnce(chain({ data: null, error: { code } }).proxy);
    await expect(createFrame('ev-1', { template: 'capas', label: 'x', params: {} })).rejects.toThrow(message);
  });

  it('updateFrame envía solo lo que cambia', async () => {
    const q = chain({ data: frameRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await updateFrame('f1', { enabled: false });
    expect(q.call('update')![0]).toEqual({ enabled: false });
    expect(q.call('eq')).toEqual(['id', 'f1']);
  });

  it('updateFrame valida parámetros y etiqueta', async () => {
    await expect(updateFrame('f1', { params: { font: 'nope' } as never })).rejects.toThrow(/Tipografía/);
    await expect(updateFrame('f1', { label: ' ' })).rejects.toThrow(/nombre al marco/);
    expect(from).not.toHaveBeenCalled();
  });

  it('deleteFrame borra por id', async () => {
    const q = chain({ data: null, error: null });
    from.mockReturnValueOnce(q.proxy);
    await deleteFrame('f1');
    expect(q.call('delete')).toBeTruthy();
    expect(q.call('eq')).toEqual(['id', 'f1']);
  });

  it('reorderFrames asigna como sort_order la posición de cada id', async () => {
    const queries = [chain({ data: null, error: null }), chain({ data: null, error: null }), chain({ data: null, error: null })];
    queries.forEach((q) => from.mockReturnValueOnce(q.proxy));
    await reorderFrames(['c', 'a', 'b']);
    expect(queries.map((q) => q.call('update')![0])).toEqual([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }]);
    expect(queries.map((q) => q.call('eq'))).toEqual([['id', 'c'], ['id', 'a'], ['id', 'b']]);
  });
});

describe('stickers', () => {
  it('listStickers mapea emoji e imágenes', async () => {
    from.mockReturnValueOnce(
      chain({
        data: [stickerRow, { ...stickerRow, id: 's2', kind: 'image', emoji: null, storage_path: 'ev-1/stickers/a.webp' }],
        error: null,
      }).proxy,
    );
    const stickers = await listStickers('ev-1');
    expect(stickers.map((s) => [s.kind, s.emoji, s.storagePath])).toEqual([
      ['emoji', '🎉', null],
      ['image', null, 'ev-1/stickers/a.webp'],
    ]);
  });

  it('addEmojiSticker acepta un emoji y rechaza texto', async () => {
    const q = chain({ data: stickerRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await addEmojiSticker('ev-1', ' 🎉 ', 4);
    expect(q.call('insert')![0]).toEqual({ event_id: 'ev-1', kind: 'emoji', emoji: '🎉', sort_order: 4 });

    await expect(addEmojiSticker('ev-1', 'hola')).rejects.toThrow(/solo emoji/);
    await expect(addEmojiSticker('ev-1', '🎉🎂')).rejects.toThrow(/solo emoji/);
  });

  it('addEmojiSticker traduce el tope de 40', async () => {
    from.mockReturnValueOnce(chain({ data: null, error: { code: '53400' } }).proxy);
    await expect(addEmojiSticker('ev-1', '🎉')).rejects.toThrow(/máximo de 40 stickers/);
  });

  it('addImageSticker procesa la imagen, la sube a {event_id}/stickers/ y crea la fila', async () => {
    vi.mocked(processStickerImage).mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));
    const q = chain({ data: { ...stickerRow, kind: 'image', emoji: null, storage_path: 'p' }, error: null });
    from.mockReturnValueOnce(q.proxy);

    await addImageSticker('ev-1', new File(['x'], 'a.png', { type: 'image/png' }));

    const [path, , options] = storageUpload.mock.calls[0];
    expect(path).toMatch(/^ev-1\/stickers\/[0-9a-f-]{36}\.webp$/);
    expect(options).toEqual({ contentType: 'image/webp' });
    expect(q.call('insert')![0]).toMatchObject({ event_id: 'ev-1', kind: 'image', storage_path: path });
  });

  it('uploadFrameImage procesa con los límites de marcos y sube a {event_id}/frames/ sin crear filas', async () => {
    vi.mocked(processStickerImage).mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));

    const path = await uploadFrameImage('ev-1', new File(['x'], 'a.png', { type: 'image/png' }));

    expect(path).toMatch(/^ev-1\/frames\/[0-9a-f-]{36}\.webp$/);
    expect(storageUpload).toHaveBeenCalledWith(path, expect.any(Blob), { contentType: 'image/webp' });
    expect(vi.mocked(processStickerImage).mock.calls[0][1]).toEqual(FRAME_IMAGE_LIMITS);
    expect(from).not.toHaveBeenCalled();
  });

  it('uploadFrameImage falla con un mensaje claro si la subida falla o la imagen no sirve', async () => {
    vi.mocked(processStickerImage).mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    storageUpload.mockResolvedValue({ error: { message: 'x' } });
    await expect(uploadFrameImage('ev-1', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(/No pudimos subir/);

    vi.mocked(processStickerImage).mockRejectedValue(new Error('Usa una imagen PNG, WebP o JPG.'));
    await expect(uploadFrameImage('ev-1', new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/PNG, WebP/);
  });

  it('addImageSticker no sube nada si la imagen no se puede procesar', async () => {
    vi.mocked(processStickerImage).mockRejectedValue(new Error('Usa una imagen PNG, WebP o JPG.'));
    await expect(addImageSticker('ev-1', new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/PNG, WebP/);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('addImageSticker borra el archivo si no se pudo crear la fila', async () => {
    vi.mocked(processStickerImage).mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));
    from.mockReturnValueOnce(chain({ data: null, error: { code: '53400' } }).proxy);

    await expect(addImageSticker('ev-1', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(/máximo de 40/);
    expect(storageRemove).toHaveBeenCalledWith([storageUpload.mock.calls[0][0]]);
  });

  it('addImageSticker falla si la subida falla, sin crear la fila', async () => {
    vi.mocked(processStickerImage).mockResolvedValue(new Blob(['x'], { type: 'image/webp' }));
    storageUpload.mockResolvedValue({ error: { message: 'x' } });
    await expect(addImageSticker('ev-1', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(/No pudimos subir/);
    expect(from).not.toHaveBeenCalled();
  });

  it('setStickerEnabled actualiza solo enabled', async () => {
    const q = chain({ data: stickerRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await setStickerEnabled('s1', false);
    expect(q.call('update')![0]).toEqual({ enabled: false });
  });

  it('deleteSticker borra la fila y, si es imagen, también el archivo', async () => {
    from.mockReturnValueOnce(chain({ data: null, error: null }).proxy);
    await deleteSticker({ id: 's1', storagePath: 'ev-1/stickers/a.webp' });
    expect(storageRemove).toHaveBeenCalledWith(['ev-1/stickers/a.webp']);

    storageRemove.mockClear();
    from.mockReturnValueOnce(chain({ data: null, error: null }).proxy);
    await deleteSticker({ id: 's2', storagePath: null });
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('deleteSticker no toca el archivo si la fila no se pudo borrar', async () => {
    from.mockReturnValueOnce(chain({ data: null, error: { code: '42501' } }).proxy);
    await expect(deleteSticker({ id: 's1', storagePath: 'p' })).rejects.toThrow(/permiso/);
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('getStickerPreviewUrl devuelve la URL firmada o null', async () => {
    storageSign.mockResolvedValueOnce({ data: { signedUrl: 'https://x/y' }, error: null });
    expect(await getStickerPreviewUrl('p')).toBe('https://x/y');
    storageSign.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await getStickerPreviewUrl('p')).toBeNull();
  });
});
