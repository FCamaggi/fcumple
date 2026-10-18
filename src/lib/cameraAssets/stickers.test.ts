import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockCtx } from '../../test/mockCanvas';
import {
  BASE_STICKER_SIZE,
  EMOJI_FONT_STACK,
  MAX_SCALE,
  MIN_SCALE,
  StickerImageError,
  applyPinch,
  clampPlacement,
  computeTargetSize,
  drawStickers,
  isSingleEmoji,
  moveBy,
  newPlacement,
  FRAME_IMAGE_LIMITS,
  processStickerImage,
  rotateBy,
  scaleBy,
  stickerPixelSize,
  type StickerAsset,
  type StickerPlacement,
} from './stickers';

const base = (over: Partial<StickerPlacement> = {}): StickerPlacement => ({ ...newPlacement('a1', 'u1'), ...over });

describe('geometría de un sticker', () => {
  it('arranca centrado, a escala 1 y sin rotar', () => {
    expect(newPlacement('a1', 'u1')).toEqual({ uid: 'u1', assetId: 'a1', x: 0.5, y: 0.5, scale: 1, rotation: 0 });
  });

  it('moveBy mueve en fracciones y nunca se sale de la foto', () => {
    expect(moveBy(base(), 0.1, -0.2)).toMatchObject({ x: 0.6, y: 0.3 });
    expect(moveBy(base({ x: 0.95 }), 0.5, 0)).toMatchObject({ x: 1 });
    expect(moveBy(base({ y: 0.05 }), 0, -0.5)).toMatchObject({ y: 0 });
  });

  it('la escala se limita entre el mínimo y el máximo', () => {
    expect(scaleBy(base(), 1.5).scale).toBeCloseTo(1.5);
    expect(scaleBy(base({ scale: 2 }), 10).scale).toBe(MAX_SCALE);
    expect(scaleBy(base(), 0.001).scale).toBe(MIN_SCALE);
  });

  it('la rotación se normaliza a 0..2π', () => {
    expect(rotateBy(base(), -Math.PI / 2).rotation).toBeCloseTo((3 * Math.PI) / 2);
    expect(rotateBy(base({ rotation: 6 }), 1).rotation).toBeCloseTo(7 - 2 * Math.PI);
    expect(clampPlacement(base({ rotation: 100 })).rotation).toBeLessThan(2 * Math.PI);
  });

  it('el pellizco aplica razón de distancias y diferencia de ángulos desde el estado inicial', () => {
    const start = base({ scale: 1, rotation: 0 });
    const pinched = applyPinch(start, 100, 0, 200, Math.PI / 4);
    expect(pinched.scale).toBeCloseTo(2);
    expect(pinched.rotation).toBeCloseTo(Math.PI / 4);
    // El estado inicial no se muta, así que el gesto se puede recalcular en cada movimiento.
    expect(start.scale).toBe(1);
    expect(applyPinch(start, 0, 0, 50, 1)).toBe(start);
    expect(applyPinch(start, 100, 0, 5000, 0).scale).toBe(MAX_SCALE);
  });

  it('el tamaño es relativo al lado menor de la foto', () => {
    expect(stickerPixelSize(600, 800, 1)).toBe(600 * BASE_STICKER_SIZE);
    expect(stickerPixelSize(800, 600, 2)).toBe(600 * BASE_STICKER_SIZE * 2);
  });
});

describe('drawStickers', () => {
  const emoji: StickerAsset = { kind: 'emoji', emoji: '🎉' };

  it('dibuja un emoji centrado en su posición normalizada, rotado y con la fuente de emoji', () => {
    const m = createMockCtx();
    drawStickers(m.ctx, 600, 800, [base({ x: 0.25, y: 0.5, scale: 2, rotation: 1 })], new Map([['a1', emoji]]));

    expect(m.calls.find((c) => c.name === 'translate')?.args).toEqual([150, 400]);
    expect(m.calls.find((c) => c.name === 'rotate')?.args).toEqual([1]);
    expect(m.texts()).toEqual(['🎉']);
    const font = String(m.calls.filter((c) => c.name === 'set:font').pop()!.args[0]);
    expect(font).toBe(`${Math.round(600 * BASE_STICKER_SIZE * 2)}px ${EMOJI_FONT_STACK}`);
    expect(m.count('save')).toBe(1);
    expect(m.count('restore')).toBe(1);
  });

  it('dibuja una imagen conservando su proporción dentro del cuadrado del sticker', () => {
    const m = createMockCtx();
    const wide = { kind: 'image', image: { width: 400, height: 200 } as unknown as CanvasImageSource } as StickerAsset;
    drawStickers(m.ctx, 1000, 1000, [base()], new Map([['a1', wide]]));

    const [, dx, dy, w, h] = m.calls.find((c) => c.name === 'drawImage')!.args as number[];
    const size = 1000 * BASE_STICKER_SIZE;
    expect([w, h]).toEqual([size, size / 2]);
    expect([dx, dy]).toEqual([-size / 2, -size / 4]);
  });

  it('respeta el orden (el último queda arriba) y se salta stickers sin recurso', () => {
    const m = createMockCtx();
    drawStickers(
      m.ctx,
      600,
      800,
      [base({ uid: '1', assetId: 'a1' }), base({ uid: '2', assetId: 'falta' }), base({ uid: '3', assetId: 'a2' })],
      new Map<string, StickerAsset>([
        ['a1', { kind: 'emoji', emoji: 'A' }],
        ['a2', { kind: 'emoji', emoji: 'B' }],
      ]),
    );
    expect(m.texts()).toEqual(['A', 'B']);
  });

  it('es independiente de la resolución', () => {
    const small = createMockCtx();
    const big = createMockCtx();
    const placements = [base({ x: 0.3, y: 0.7, scale: 1.5 })];
    drawStickers(small.ctx, 300, 400, placements, new Map([['a1', emoji]]));
    drawStickers(big.ctx, 900, 1200, placements, new Map([['a1', emoji]]));
    const pos = (m: ReturnType<typeof createMockCtx>) => m.calls.find((c) => c.name === 'translate')!.args as number[];
    expect(pos(big)).toEqual(pos(small).map((n) => n * 3));
  });
});

describe('isSingleEmoji', () => {
  it.each(['🎉', '❤️', '👍🏽', '🇨🇱', '👨‍👩‍👧', '1️⃣', ' 🥳 '])('acepta %j', (text) => {
    expect(isSingleEmoji(text)).toBe(true);
  });

  it.each(['', '   ', 'a', 'hola', '🎉🎂', '🎉 hola', '<script>', 'x'.repeat(40)])('rechaza %j', (text) => {
    expect(isSingleEmoji(text)).toBe(false);
  });
});

describe('computeTargetSize', () => {
  it('reduce al máximo conservando la proporción y no agranda', () => {
    expect(computeTargetSize(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(computeTargetSize(1000, 4000)).toEqual({ width: 128, height: 512 });
    expect(computeTargetSize(100, 80)).toEqual({ width: 100, height: 80 });
    expect(computeTargetSize(1, 5000)).toEqual({ width: 1, height: 512 });
  });
});

describe('processStickerImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const file = (type: string) => new File(['x'], 'a', { type });

  function stubCanvas(sizes: number[], type = 'image/webp') {
    let call = 0;
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      const size = sizes[Math.min(call++, sizes.length - 1)];
      cb(new Blob([new Uint8Array(size)], { type }));
    });
    const ctx = { drawImage: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob,
    } as unknown as HTMLCanvasElement);
    return { toBlob, ctx };
  }

  it('rechaza SVG y cualquier tipo que no sea PNG, WebP o JPEG', async () => {
    for (const type of ['image/svg+xml', 'image/gif', 'text/html', '']) {
      await expect(processStickerImage(file(type))).rejects.toThrow(StickerImageError);
    }
  });

  it('rechaza archivos que no se pueden decodificar', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    await expect(processStickerImage(file('image/png'))).rejects.toThrow(/No pudimos leer/);
  });

  it('reduce, convierte a WebP y baja la calidad hasta pesar menos de 300 KB', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2000, height: 1000, close: vi.fn() }));
    const { toBlob, ctx } = stubCanvas([900_000, 500_000, 200_000]);

    const blob = await processStickerImage(file('image/png'));

    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBe(200_000);
    expect(toBlob).toHaveBeenCalledTimes(3);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
  });

  it('falla con un mensaje claro si nunca baja de 300 KB', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10 }));
    stubCanvas([999_999]);
    await expect(processStickerImage(file('image/png'))).rejects.toThrow(/muy pesada/);
  });

  it('con los límites de las imágenes de marcos conserva hasta 1600 px y acepta hasta 1 MB', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close: vi.fn() }));
    const { ctx } = stubCanvas([900_000]);

    const blob = await processStickerImage(file('image/png'), FRAME_IMAGE_LIMITS);

    expect(blob.size).toBe(900_000);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(FRAME_IMAGE_LIMITS).toEqual({ maxDimension: 1600, maxBytes: 1024 * 1024 });
  });

  it('en navegadores sin WebP cae a PNG si cabe', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10 }));
    stubCanvas([10_000], 'image/png');
    const blob = await processStickerImage(file('image/jpeg'));
    expect(blob.type).toBe('image/png');
  });
});
