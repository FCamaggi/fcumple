import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockCtx } from '../../test/mockCanvas';
import {
  MAX_LAYERS,
  assetLayerKey,
  boxRect,
  collectAssetKeys,
  collectImagePaths,
  collectLayerFonts,
  drawLayers,
  prepareFrameAssets,
  sanitizeLayers,
  validateLayers,
  type FrameLayer,
} from './layers';
import { clearPackAssetCache, registerPackManifest, registerPackSvg } from './packs';

const EVENT = '123e4567-e89b-42d3-a456-426614174000';
const IMAGE_PATH = `${EVENT}/frames/overlay.png`;

const text: FrameLayer = { type: 'text', text: 'Cumpleaños Fran', x: 0.5, y: 0.9, size: 0.08, font: 'display', color: '#ff4fa3' };
const rect: FrameLayer = { type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.2, fill: '#111111' };

describe('validateLayers', () => {
  it('acepta una lista vacía y una de cada tipo de capa', () => {
    expect(validateLayers([])).toEqual({ ok: true });
    expect(
      validateLayers([
        text,
        rect,
        { type: 'shape', shape: 'ellipse', w: 0.2, h: 0.1, stroke: '#ffffff', strokeWidth: 0.01 },
        { type: 'shape', shape: 'line', w: 0.4, stroke: '#ffffff', strokeWidth: 0.01 },
        { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: 'M10 90 L50 10 L90 90 Z', fill: '#000000' },
        { type: 'image', src: IMAGE_PATH, w: 0.5, h: 0.5 },
        { type: 'image', src: IMAGE_PATH, full: true },
        { type: 'emoji', emoji: '🦇', size: 0.1, rotation: -15, opacity: 0.8, anchor: 'tl' },
        { type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.2, h: 0.2 },
        { type: 'asset', asset: 'pack:halloween-neon/orejas-conejita', w: 0.3, h: 0.3, tint: '#ff2f92', locked: true },
        { ...text, font: 'pacifico' },
        { ...rect, shadow: { color: '#000000', blur: 0.02, x: 0.01, y: 0.01 } },
      ]),
    ).toEqual({ ok: true });
  });

  it.each([
    ['no es una lista', { type: 'text' }],
    ['capa que no es objeto', ['hola']],
    ['tipo desconocido', [{ type: 'script', text: 'x' }]],
    ['tipo heredado de Object', [{ type: 'constructor' }]],
    ['tipo __proto__', [{ type: '__proto__' }]],
    ['clave desconocida', [{ ...rect, onclick: 'alert(1)' }]],
    ['color sin #', [{ ...rect, fill: 'red' }]],
    ['texto vacío', [{ ...text, text: '' }]],
    ['texto de 61 caracteres', [{ ...text, text: 'a'.repeat(61) }]],
    ['tipografía fuera de la lista', [{ ...text, font: 'comic-sans' }]],
    ['tipografía en mayúsculas', [{ ...text, font: 'Anton' }]],
    ['tamaño de texto fuera de rango', [{ ...text, size: 5 }]],
    ['posición que no es número', [{ ...rect, x: '0.5' }]],
    ['posición NaN', [{ ...rect, x: Number.NaN }]],
    ['posición fuera de rango', [{ ...rect, y: 9 }]],
    ['rotación fuera de rango', [{ ...rect, rotation: 720 }]],
    ['opacidad mayor que 1', [{ ...rect, opacity: 1.2 }]],
    ['ancla desconocida', [{ ...rect, anchor: 'middle' }]],
    ['forma desconocida', [{ type: 'shape', shape: 'star', w: 0.1, h: 0.1 }]],
    ['path sin d', [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1 }]],
    ['d en una forma que no es path', [{ ...rect, d: 'M0 0' }]],
    ['path con comandos no permitidos', [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: 'M0 0 A5 5 0 0 1 10 10' }]],
    ['path con notación científica', [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: 'M1e9 0 L5 5' }]],
    ['path demasiado largo', [{ type: 'shape', shape: 'path', w: 0.1, h: 0.1, d: `M0 0${' L1 1'.repeat(200)}` }]],
    ['imagen con URL', [{ type: 'image', src: 'https://evil.example/x.png', w: 0.5, h: 0.5 }]],
    ['imagen de otra carpeta', [{ type: 'image', src: `${EVENT}/stickers/x.png`, w: 0.5, h: 0.5 }]],
    ['imagen con ../', [{ type: 'image', src: `${EVENT}/frames/../x.png`, w: 0.5, h: 0.5 }]],
    ['imagen sin tamaño ni full', [{ type: 'image', src: IMAGE_PATH }]],
    ['asset sin prefijo pack:', [{ type: 'asset', asset: 'halloween-neon/murcielago', w: 0.2, h: 0.2 }]],
    ['asset con ../', [{ type: 'asset', asset: 'pack:../evil/x', w: 0.2, h: 0.2 }]],
    ['asset con mayúsculas', [{ type: 'asset', asset: 'pack:Halloween/Bat', w: 0.2, h: 0.2 }]],
    ['asset sin tamaño w/h', [{ type: 'asset', asset: 'pack:halloween-neon/murcielago' }]],
    ['asset con w fuera de rango', [{ type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 5, h: 0.2 }]],
    ['asset con tint inválido', [{ type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.2, h: 0.2, tint: '$acento' }]],
    ['locked no booleano', [{ ...rect, locked: 'true' }]],
    ['emoji vacío', [{ type: 'emoji', emoji: '', size: 0.1 }]],
    ['sombra con color inválido', [{ ...rect, shadow: { color: 'black', blur: 0.01, x: 0, y: 0 } }]],
    ['sombra con clave ajena', [{ ...rect, shadow: { color: '#000000', blur: 0.01, x: 0, y: 0, extra: 1 } }]],
  ])('rechaza %s', (_name, layers) => {
    expect(validateLayers(layers).ok).toBe(false);
  });

  it(`rechaza más de ${MAX_LAYERS} capas`, () => {
    expect(validateLayers(Array.from({ length: MAX_LAYERS }, () => rect)).ok).toBe(true);
    expect(validateLayers(Array.from({ length: MAX_LAYERS + 1 }, () => rect)).ok).toBe(false);
  });
});

describe('sanitizeLayers', () => {
  it('conserva las capas válidas y descarta las inválidas sin romper el resto', () => {
    const out = sanitizeLayers([text, { type: 'script' }, 'x', { ...rect, fill: 'red' }, rect]);
    expect(out).toEqual([text, rect]);
  });

  it('descarta todo lo que pase del tope y devuelve [] si no es una lista', () => {
    expect(sanitizeLayers(Array.from({ length: MAX_LAYERS + 10 }, () => rect))).toHaveLength(MAX_LAYERS);
    expect(sanitizeLayers(null)).toEqual([]);
    expect(sanitizeLayers({ 0: rect })).toEqual([]);
  });
});

describe('collectLayerFonts', () => {
  it('devuelve las tipografías de las capas de texto, sin repetir', () => {
    expect(
      collectLayerFonts([
        { ...text, font: 'anton' },
        rect,
        { ...text, font: 'pacifico' },
        { ...text, font: 'anton' },
        { type: 'text', text: 'sin fuente' },
      ]),
    ).toEqual(['anton', 'pacifico', 'sans']);
  });
});

describe('collectImagePaths', () => {
  it('devuelve las rutas de imagen sin repetir', () => {
    const other = `${EVENT}/frames/otra.png`;
    expect(
      collectImagePaths([
        { type: 'image', src: IMAGE_PATH, full: true },
        text,
        { type: 'image', src: other, w: 0.2, h: 0.2 },
        { type: 'image', src: IMAGE_PATH, w: 0.2, h: 0.2 },
      ]),
    ).toEqual([IMAGE_PATH, other]);
  });
});

describe('drawLayers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('guarda y restaura el contexto una vez por capa', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [rect, text]);
    expect(m.count('save')).toBe(2);
    expect(m.count('restore')).toBe(2);
  });

  it('coloca la capa por fracciones del lienzo y el tamaño por el lado menor', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ type: 'shape', shape: 'rect', x: 0.5, y: 0.25, w: 0.5, h: 0.1, fill: '#112233' }]);
    expect(m.calls.find((c) => c.name === 'translate')?.args).toEqual([300, 200]);
    expect(m.fills()).toContain('#112233');
    // Centrado: el rectángulo de 300 × 60 parte en (-150, -30).
    expect(m.calls.find((c) => c.name === 'moveTo')?.args).toEqual([-150, -30]);
  });

  it('el ancla desplaza la forma: tl la deja con su esquina en el punto', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 0.5, h: 0.5, fill: '#000000', anchor: 'tl' }]);
    // Elipse de 300 × 300 con esquina en el origen: centro en (150, 150).
    expect(m.calls.find((c) => c.name === 'ellipse')?.args.slice(0, 4)).toEqual([150, 150, 150, 150]);
  });

  it('rota en grados y aplica la opacidad', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ ...rect, rotation: 90, opacity: 0.5 }]);
    expect(m.calls.find((c) => c.name === 'rotate')?.args[0]).toBeCloseTo(Math.PI / 2);
    expect(m.calls.find((c) => c.name === 'set:globalAlpha')?.args[0]).toBe(0.5);
  });

  it('aplica la sombra en píxeles relativos al lado menor', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ ...rect, shadow: { color: '#000000', blur: 0.05, x: 0.01, y: 0.02 } }]);
    const set = (name: string) => m.calls.find((c) => c.name === `set:${name}`)?.args[0];
    expect(set('shadowColor')).toBe('#000000');
    expect(set('shadowBlur')).toBe(30);
    expect(set('shadowOffsetX')).toBe(6);
    expect(set('shadowOffsetY')).toBe(12);
  });

  it('texto: lo dibuja con la tipografía pedida y, con borde, lo traza antes de rellenarlo', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ ...text, strokeColor: '#000000', strokeWidth: 0.01 }]);
    expect(m.texts()).toEqual(['Cumpleaños Fran']);
    expect(m.count('strokeText')).toBe(1);
    const order = m.calls.map((c) => c.name);
    expect(order.indexOf('strokeText')).toBeLessThan(order.indexOf('fillText'));
    expect(String(m.calls.find((c) => c.name === 'set:font')!.args[0])).toMatch(/Impact/);
  });

  it('texto largo: nunca se pasa de su ancho', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ ...text, text: 'a'.repeat(60), w: 0.5 }]);
    expect(m.ctx.measureText(m.texts()[0]).width).toBeLessThanOrEqual(300);
  });

  it('emoji: lo dibuja como texto', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ type: 'emoji', emoji: '🦇', size: 0.1, x: 0.2, y: 0.2 }]);
    expect(m.texts()).toEqual(['🦇']);
  });

  it('path: usa Path2D escalado a la caja y se omite si el navegador no lo tiene', () => {
    const created: string[] = [];
    vi.stubGlobal(
      'Path2D',
      class {
        constructor(d: string) {
          created.push(d);
        }
      },
    );
    const withPath = createMockCtx();
    const layer: FrameLayer = { type: 'shape', shape: 'path', w: 0.5, h: 0.5, d: 'M0 0 L100 100 Z', fill: '#ff0000' };
    drawLayers(withPath.ctx, 600, 800, 600, [layer]);
    expect(created).toEqual(['M0 0 L100 100 Z']);
    expect(withPath.calls.find((c) => c.name === 'scale')?.args).toEqual([3, 3]);
    expect(withPath.count('fill')).toBe(1);
    vi.unstubAllGlobals();

    vi.stubGlobal('Path2D', undefined);
    const without = createMockCtx();
    drawLayers(without.ctx, 600, 800, 600, [layer]);
    expect(without.count('fill')).toBe(0);
    vi.unstubAllGlobals();
  });

  it('imagen: se dibuja solo si está cargada; full cubre todo el lienzo', () => {
    const img = {} as CanvasImageSource;
    const assets = { images: new Map([[IMAGE_PATH, img]]) };

    const missing = createMockCtx();
    drawLayers(missing.ctx, 600, 800, 600, [{ type: 'image', src: IMAGE_PATH, full: true }], { images: new Map() });
    expect(missing.count('drawImage')).toBe(0);

    const full = createMockCtx();
    drawLayers(full.ctx, 600, 800, 600, [{ type: 'image', src: IMAGE_PATH, full: true }], assets);
    expect(full.calls.find((c) => c.name === 'drawImage')?.args).toEqual([img, 0, 0, 600, 800]);

    const boxed = createMockCtx();
    drawLayers(boxed.ctx, 600, 800, 600, [{ type: 'image', src: IMAGE_PATH, w: 0.5, h: 0.25, x: 0.5, y: 0.5 }], assets);
    expect(boxed.calls.find((c) => c.name === 'drawImage')?.args).toEqual([img, -150, -75, 300, 150]);
  });

  it('dibuja las capas en orden: la primera queda al fondo', () => {
    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, [{ ...rect, fill: '#aa0000' }, { ...rect, fill: '#00aa00' }]);
    const fills = m.fills().filter((f) => f === '#aa0000' || f === '#00aa00');
    expect(fills).toEqual(['#aa0000', '#00aa00']);
  });
});

describe('anclaje a los bordes: dx, dy y box', () => {
  const plate: FrameLayer = { type: 'shape', shape: 'rect', box: { l: 0.05, r: 0.05, b: 0.05 }, h: 0.25, fill: '#0d0b12' };

  it('valida dx y dy (entre -2 y 2) y la caja pegada a los bordes', () => {
    expect(validateLayers([{ ...text, x: 0, y: 1, dx: 0.1, dy: -0.2 }])).toEqual({ ok: true });
    expect(validateLayers([plate])).toEqual({ ok: true });
    expect(validateLayers([{ type: 'shape', shape: 'line', box: { l: 0.05, r: 0.05, b: 0.3 }, stroke: '#ffffff' }])).toEqual({ ok: true });
    expect(validateLayers([{ ...text, dx: 3 }]).ok).toBe(false);
    expect(validateLayers([{ ...text, dy: -2.5 }]).ok).toBe(false);
    expect(validateLayers([{ ...text, dx: '0.1' as unknown as number }]).ok).toBe(false);
  });

  it('rechaza una caja mal armada o en una forma que no la admite', () => {
    const withBox = (shape: string, box: unknown) => [{ type: 'shape', shape, w: 0.2, h: 0.2, fill: '#000000', box }] as unknown as FrameLayer[];
    expect(validateLayers(withBox('ellipse', { l: 0.05 })).ok).toBe(false);
    expect(validateLayers(withBox('path', { l: 0.05 })).ok).toBe(false);
    expect(validateLayers(withBox('rect', {})).ok).toBe(false);
    expect(validateLayers(withBox('rect', { l: -0.1 })).ok).toBe(false);
    expect(validateLayers(withBox('rect', { r: 1.5 })).ok).toBe(false);
    expect(validateLayers(withBox('rect', { x: 0.1 })).ok).toBe(false);
    expect(validateLayers(withBox('rect', { l: '0.1' })).ok).toBe(false);
    expect(validateLayers(withBox('rect', [0.1])).ok).toBe(false);
  });

  it('dx y dy se suman a la posición en unidades del lado menor, en vertical y en horizontal', () => {
    const corner: FrameLayer = { type: 'shape', shape: 'rect', x: 0, y: 1, dx: 0.1, dy: -0.2, w: 0.1, h: 0.1, fill: '#000000', anchor: 'bl' };
    const vertical = createMockCtx();
    drawLayers(vertical.ctx, 600, 800, 600, [corner]);
    expect(vertical.calls.find((c) => c.name === 'translate')?.args).toEqual([60, 680]);
    const horizontal = createMockCtx();
    drawLayers(horizontal.ctx, 800, 600, 600, [corner]);
    expect(horizontal.calls.find((c) => c.name === 'translate')?.args).toEqual([60, 480]);
  });

  it('boxRect: la caja con márgenes a los dos lados toma el ancho del lienzo; con un solo borde usa w y h', () => {
    expect(boxRect(plate, 600, 800, 600)).toEqual([30, 620, 540, 150]);
    expect(boxRect(plate, 800, 600, 600)).toEqual([30, 420, 740, 150]);
    // Anillo: los cuatro márgenes, sin w ni h.
    expect(boxRect({ type: 'shape', shape: 'rect', box: { l: 0.025, t: 0.025, r: 0.025, b: 0.025 } }, 800, 600, 600)).toEqual([15, 15, 770, 570]);
    // Solo un borde y ningún lado opuesto: usa w y queda pegada a ese borde.
    expect(boxRect({ type: 'shape', shape: 'rect', box: { r: 0.1, t: 0.1 }, w: 0.2, h: 0.3 }, 800, 600, 600)).toEqual([620, 60, 120, 180]);
    // Línea: solo importa el borde vertical.
    expect(boxRect({ type: 'shape', shape: 'line', box: { l: 0.05, r: 0.05, b: 0.3 } }, 800, 600, 600)).toEqual([30, 420, 740, 0]);
  });

  it('boxRect: un solo borde inicial, ningún borde en un eje, y márgenes que sobrepasan el lienzo', () => {
    const rectBox = (box: object, patch: object = {}) => ({ type: 'shape', shape: 'rect', w: 0.2, h: 0.3, box, ...patch }) as FrameLayer & { type: 'shape' };
    // Solo l y t: pegada a la esquina de arriba a la izquierda, con w y h.
    expect(boxRect(rectBox({ l: 0.1, t: 0.1 }), 800, 600, 600)).toEqual([60, 60, 120, 180]);
    // Solo l: en vertical queda centrada.
    expect(boxRect(rectBox({ l: 0.1 }), 800, 600, 600)).toEqual([60, 210, 120, 180]);
    // Solo t: en horizontal queda centrada.
    expect(boxRect(rectBox({ t: 0.1 }), 800, 600, 600)).toEqual([340, 60, 120, 180]);
    // Márgenes que suman más que el lienzo: el ancho nunca es negativo.
    expect(boxRect(rectBox({ l: 0.7, r: 0.7 }), 800, 600, 600)[2]).toBe(0);
  });

  it('boxRect: una línea con t y b se dibuja en el borde de arriba y no tiene alto', () => {
    const line = { type: 'shape', shape: 'line', box: { l: 0.05, r: 0.05, t: 0.1, b: 0.1 } } as FrameLayer & { type: 'shape' };
    expect(boxRect(line, 800, 600, 600)).toEqual([30, 60, 740, 0]);
  });

  it('acepta dx y dy justo en los extremos (±2) y rechaza una caja o un margen nulos', () => {
    expect(validateLayers([{ ...text, dx: 2, dy: -2 }])).toEqual({ ok: true });
    expect(validateLayers([{ ...rect, box: null } as unknown as FrameLayer]).ok).toBe(false);
    expect(validateLayers([{ ...rect, box: { l: null } } as unknown as FrameLayer]).ok).toBe(false);
    expect(validateLayers([{ ...rect, box: 5 } as unknown as FrameLayer]).ok).toBe(false);
  });

  it('una caja se dibuja pegada a los bordes aunque cambie la proporción del lienzo', () => {
    for (const [w, h] of [[600, 800], [800, 600], [450, 800]] as const) {
      const m = createMockCtx();
      drawLayers(m.ctx, w, h, Math.min(w, h), [plate]);
      const unit = Math.min(w, h);
      expect(m.calls.some((c) => c.name === 'translate')).toBe(false);
      expect(m.calls.find((c) => c.name === 'moveTo')?.args).toEqual([0.05 * unit, h - 0.05 * unit - 0.25 * unit]);
      expect(m.calls.find((c) => c.name === 'lineTo')?.args).toEqual([w - 0.05 * unit, h - 0.05 * unit - 0.25 * unit]);
    }
  });
});

describe('prepareFrameAssets', () => {
  it('también carga las tipografías web de las capas de texto', async () => {
    const loadFonts = vi.fn().mockResolvedValue(undefined);
    await prepareFrameAssets([{ ...text, font: 'anton' }, rect], (p) => p, vi.fn(), loadFonts);
    expect(loadFonts).toHaveBeenCalledWith(['anton']);
  });

  it('carga cada imagen una vez con la URL que resuelve el llamador', async () => {
    const img = {} as CanvasImageSource;
    const load = vi.fn().mockResolvedValue(img);
    const resolveUrl = vi.fn((path: string) => `https://cdn.example/${path}`);

    const assets = await prepareFrameAssets(
      [{ type: 'image', src: IMAGE_PATH, full: true }, { type: 'image', src: IMAGE_PATH, w: 0.2, h: 0.2 }, text],
      resolveUrl,
      load,
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(`https://cdn.example/${IMAGE_PATH}`);
    expect(assets.images.get(IMAGE_PATH)).toBe(img);
  });

  it('acepta un resolveUrl asíncrono (las URL firmadas de Storage lo son)', async () => {
    const img = {} as CanvasImageSource;
    const load = vi.fn().mockResolvedValue(img);
    const assets = await prepareFrameAssets(
      [{ type: 'image', src: IMAGE_PATH, full: true }],
      async (path) => `https://signed.example/${path}?token=abc`,
      load,
      vi.fn().mockResolvedValue(undefined),
    );
    expect(load).toHaveBeenCalledWith(`https://signed.example/${IMAGE_PATH}?token=abc`);
    expect(assets.images.get(IMAGE_PATH)).toBe(img);
  });

  it('si resolver la URL falla, esa imagen queda fuera y el resto sigue', async () => {
    const other = `${EVENT}/frames/otra.png`;
    const img = {} as CanvasImageSource;
    const assets = await prepareFrameAssets(
      [{ type: 'image', src: IMAGE_PATH, full: true }, { type: 'image', src: other, full: true }],
      (path) => (path === IMAGE_PATH ? Promise.reject(new Error('sin permiso')) : Promise.resolve(path)),
      vi.fn().mockResolvedValue(img),
      vi.fn().mockResolvedValue(undefined),
    );
    expect([...assets.images.keys()]).toEqual([other]);
  });

  it('si una imagen falla, sigue con las demás y deja esa fuera', async () => {
    const other = `${EVENT}/frames/otra.png`;
    const img = {} as CanvasImageSource;
    const load = vi.fn((url: string) => (url.endsWith('otra.png') ? Promise.resolve(img) : Promise.reject(new Error('404'))));

    const assets = await prepareFrameAssets(
      [{ type: 'image', src: IMAGE_PATH, full: true }, { type: 'image', src: other, full: true }],
      (p) => p,
      load,
    );

    expect([...assets.images.keys()]).toEqual([other]);
  });

  it('resuelve, recolorea (recolorSvgToDataUri) y cachea recursos type: asset con y sin tint', async () => {
    clearPackAssetCache();
    registerPackManifest({
      id: 'halloween-neon',
      name: 'Halloween Neón',
      version: 1,
      visibility: 'public',
      palette: { acento: '#ff2f92', fondo: '#0d0b12', texto: '#ffffff' },
      assets: [
        {
          id: 'murcielago',
          name: 'Murciélago',
          category: 'ilustracion',
          file: 'murcielago.svg',
          format: 'svg',
          recolorable: true,
          license: { source: 'Propia', spdx: 'LicenseRef-Own', date: '2026-10-25' },
        },
      ],
      presets: [],
    });
    registerPackSvg(
      'halloween-neon',
      'murcielago.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="$acento" stroke="$fondo"/></svg>',
    );

    const loadedUrls: string[] = [];
    const imgBase = { tag: 'base' } as unknown as CanvasImageSource;
    const imgTinted = { tag: 'tinted' } as unknown as CanvasImageSource;
    const load = vi.fn(async (url: string) => {
      loadedUrls.push(url);
      return url.includes(encodeURIComponent('#c8f23a')) ? imgTinted : imgBase;
    });

    const layers: FrameLayer[] = [
      { type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.2, h: 0.1 },
      { type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.2, h: 0.1, tint: '#C8F23A' },
      { type: 'asset', asset: 'pack:halloween-neon/murcielago', w: 0.3, h: 0.15, tint: '#c8f23a' },
    ];

    expect(collectAssetKeys(layers)).toEqual([
      'pack:halloween-neon/murcielago',
      'pack:halloween-neon/murcielago@#c8f23a',
    ]);
    expect(assetLayerKey({ asset: 'pack:halloween-neon/murcielago', tint: '#FF2F92' })).toBe(
      'pack:halloween-neon/murcielago@#ff2f92',
    );

    const assets = await prepareFrameAssets(layers, (p) => p, load, vi.fn().mockResolvedValue(undefined));
    expect(load).toHaveBeenCalledTimes(2);
    expect(loadedUrls[0]).toContain(encodeURIComponent('#ff2f92'));
    expect(loadedUrls[1]).toContain(encodeURIComponent('#c8f23a'));

    const m = createMockCtx();
    drawLayers(m.ctx, 600, 800, 600, layers, assets);
    expect(m.count('drawImage')).toBe(3);
    expect(m.calls.filter((c) => c.name === 'drawImage')[0].args).toEqual([imgBase, -60, -30, 120, 60]);
    expect(m.calls.filter((c) => c.name === 'drawImage')[1].args).toEqual([imgTinted, -60, -30, 120, 60]);
  });
});
