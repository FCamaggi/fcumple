import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: {} }));
vi.mock('./cameraStudioApi', () => ({ listFrames: vi.fn(), listStickers: vi.fn() }));

import { listFrames, listStickers, type EventFrame, type EventSticker } from './cameraStudioApi';
import { listPreviewCameraAssets } from './previewCameraAssets';

const frame = (id: string, enabled = true): EventFrame => ({
  id,
  eventId: 'ev-1',
  template: 'capas',
  label: `Marco ${id}`,
  params: {},
  enabled,
  sortOrder: 0,
});
const sticker = (id: string, enabled = true, kind: 'emoji' | 'image' = 'emoji'): EventSticker => ({
  id,
  eventId: 'ev-1',
  kind,
  emoji: kind === 'emoji' ? '🎃' : null,
  storagePath: kind === 'image' ? `ev-1/${id}.webp` : null,
  enabled,
  sortOrder: 0,
});

const event = { id: 'ev-1', framesEnabled: true, stickersEnabled: true, defaultFrameId: 'f2' };

describe('listPreviewCameraAssets', () => {
  beforeEach(() => {
    vi.mocked(listFrames).mockReset().mockResolvedValue([frame('f1'), frame('f2'), frame('f3', false)]);
    vi.mocked(listStickers).mockReset().mockResolvedValue([sticker('s1'), sticker('s2', false), sticker('s3', true, 'image')]);
  });

  it('deja solo las piezas activas, como la lista del invitado', async () => {
    const { frames, stickers } = await listPreviewCameraAssets(event);
    expect(frames.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(stickers.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(stickers[1]).toEqual({ id: 's3', kind: 'image', emoji: null, storagePath: 'ev-1/s3.webp' });
  });

  it('marca como predeterminado el marco que eligió el evento', async () => {
    const { frames } = await listPreviewCameraAssets(event);
    expect(frames.map((f) => f.isDefault)).toEqual([false, true]);
  });

  it('con el interruptor global apagado no pide ni muestra esa clase de piezas', async () => {
    const { frames, stickers } = await listPreviewCameraAssets({ ...event, framesEnabled: false, stickersEnabled: false });
    expect(frames).toEqual([]);
    expect(stickers).toEqual([]);
    expect(listFrames).not.toHaveBeenCalled();
    expect(listStickers).not.toHaveBeenCalled();
  });

  it('propaga el error de la lectura', async () => {
    vi.mocked(listFrames).mockRejectedValue(new Error('No pudimos cargar los marcos.'));
    await expect(listPreviewCameraAssets(event)).rejects.toThrow('No pudimos cargar los marcos.');
  });
});
