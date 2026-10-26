import { describe, expect, it } from 'vitest';
import { createMockCtx } from '../../test/mockCanvas';
import {
  FRAME_FONTS,
  FRAME_TEMPLATES,
  MAX_TEXT_LENGTH,
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_FIELDS,
  TEMPLATE_LABELS,
  defaultFrameParams,
  drawFittedText,
  renderFrame,
  sanitizeFrameParams,
  validateFrameParams,
} from './frames';
import { MAX_LAYERS, MAX_LAYERS_PARAMS_LENGTH } from './layers';

describe('validateFrameParams (misma regla que la base de datos)', () => {
  it('acepta {} y parámetros completos válidos', () => {
    expect(validateFrameParams({})).toEqual({ ok: true });
    expect(
      validateFrameParams({
        primaryColor: '#FF00aa',
        secondaryColor: '#000000',
        textColor: '#ffffff',
        title: 'Hola',
        subtitle: 'Mundo',
        caption: 'Pie',
        font: 'hand',
        thickness: 0.5,
        radius: 0,
        position: 'top',
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    ['color sin #', { primaryColor: 'ff0000' }],
    ['color con nombre', { primaryColor: 'red' }],
    ['color de 3 dígitos', { textColor: '#fff' }],
    ['texto de 61 caracteres', { title: 'a'.repeat(MAX_TEXT_LENGTH + 1) }],
    ['texto que no es string', { caption: 12 }],
    ['fuente desconocida', { font: 'comic-sans' }],
    ['grosor fuera de rango', { thickness: 1.5 }],
    ['radio negativo', { radius: -0.1 }],
    ['grosor como texto', { thickness: '0.1' }],
    ['posición inválida', { position: 'left' }],
    ['clave desconocida', { script: '<script>alert(1)</script>' }],
    ['demasiado grande', { title: 'a'.repeat(60), subtitle: 'b'.repeat(60), caption: 'c'.repeat(60), extra: 'x'.repeat(2100) }],
  ])('rechaza %s', (_name, params) => {
    expect(validateFrameParams(params).ok).toBe(false);
  });

  it.each([null, 'texto', 5, [1, 2]])('rechaza lo que no es un objeto (%j)', (value) => {
    expect(validateFrameParams(value).ok).toBe(false);
  });
});

describe('sanitizeFrameParams', () => {
  it('conserva lo válido y descarta claves ajenas y valores inválidos', () => {
    expect(
      sanitizeFrameParams({ primaryColor: '#112233', title: 'ok', hack: 'x', thickness: 9, font: 'nope', position: 'top' }),
    ).toEqual({ primaryColor: '#112233', title: 'ok', position: 'top' });
  });

  it.each([null, undefined, 'x', 3, [1]])('devuelve {} para %j', (value) => {
    expect(sanitizeFrameParams(value)).toEqual({});
  });
});

describe('plantillas', () => {
  it('cada plantilla declara campos que la validación conoce', () => {
    const sample: Record<string, unknown> = {
      primaryColor: '#112233',
      secondaryColor: '#445566',
      textColor: '#778899',
      title: 'Título',
      subtitle: 'Sub',
      caption: 'Pie',
      font: FRAME_FONTS[0],
      thickness: 0.1,
      radius: 0.1,
      position: 'top',
      layers: [],
    };
    for (const template of FRAME_TEMPLATES) {
      expect(TEMPLATE_FIELDS[template].length).toBeGreaterThan(0);
      for (const field of TEMPLATE_FIELDS[template]) {
        expect(sample).toHaveProperty(field);
        expect(validateFrameParams({ [field]: sample[field] }).ok).toBe(true);
      }
    }
  });

  it.each(FRAME_TEMPLATES)('los parámetros por defecto de %s son válidos, con y sin datos del evento', (template) => {
    expect(validateFrameParams(defaultFrameParams(template)).ok).toBe(true);
    expect(
      validateFrameParams(defaultFrameParams(template, { eventName: 'x'.repeat(200), eventDate: '05/12/2026' })).ok,
    ).toBe(true);
  });
});

describe('plantilla capas', () => {
  const layer = { type: 'shape', shape: 'rect', w: 0.5, h: 0.2, fill: '#112233' } as const;
  const textLayer = { type: 'text', text: 'Cumpleaños Fran', font: 'display', color: '#ff4fa3' } as const;

  it('está registrada con etiqueta, descripción y el campo layers', () => {
    expect(FRAME_TEMPLATES).toContain('capas');
    expect(TEMPLATE_LABELS.capas).toBeTruthy();
    expect(TEMPLATE_DESCRIPTIONS.capas).toBeTruthy();
    expect(TEMPLATE_FIELDS.capas).toEqual(['layers']);
  });

  it('valida la lista de capas dentro de params', () => {
    expect(validateFrameParams({ layers: [layer, textLayer] })).toEqual({ ok: true });
    expect(validateFrameParams({ layers: [{ ...layer, fill: 'red' }] }).ok).toBe(false);
    expect(validateFrameParams({ layers: 'x' }).ok).toBe(false);
    expect(validateFrameParams({ layers: Array.from({ length: MAX_LAYERS + 1 }, () => layer) }).ok).toBe(false);
  });

  it('con capas el tope del JSON sube a 16 KB; sin capas sigue en 2 KB', () => {
    const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000' };
    const big = { layers: Array.from({ length: 24 }, () => path) };
    expect(JSON.stringify(big).length).toBeGreaterThan(2048);
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(MAX_LAYERS_PARAMS_LENGTH);
    expect(validateFrameParams(big)).toEqual({ ok: true });
    expect(validateFrameParams({ title: 'a'.repeat(60), layers: Array.from({ length: 40 }, () => path) }).ok).toBe(false);
    // Sin capas, aunque quepa en 16 KB, 2 KB es el tope: lo llena un `layers` ausente más claves válidas.
    const heavy = { layers: [] as unknown[], title: 'a'.repeat(60) };
    expect(validateFrameParams(heavy)).toEqual({ ok: true });
    const overTwoKb = { title: 'a'.repeat(60), subtitle: 'b'.repeat(60), caption: 'c'.repeat(60), primaryColor: '#112233' };
    expect(JSON.stringify(overTwoKb).length).toBeLessThan(2048);
    expect(validateFrameParams({ ...overTwoKb, font: 'x'.repeat(2100) }).ok).toBe(false);
  });

  it('sanitize conserva las capas válidas y descarta las inválidas', () => {
    expect(sanitizeFrameParams({ layers: [layer, { type: 'script' }, textLayer], hack: 1 })).toEqual({
      layers: [layer, textLayer],
    });
    expect(sanitizeFrameParams({ layers: 'x' })).toEqual({});
  });

  it('los parámetros por defecto son válidos y llevan el nombre del evento', () => {
    expect(validateFrameParams(defaultFrameParams('capas'))).toEqual({ ok: true });
    expect(defaultFrameParams('capas').layers).toEqual([]);
    const withName = defaultFrameParams('capas', { eventName: 'Cumpleaños Fran' });
    expect(validateFrameParams(withName)).toEqual({ ok: true });
    expect(withName.layers?.[0]).toMatchObject({ type: 'text', text: 'Cumpleaños Fran', font: 'anton' });
  });

  it('renderFrame dibuja las capas, y sin capas no dibuja nada más que el save/restore', () => {
    const empty = createMockCtx();
    renderFrame(empty.ctx, 600, 800, 'capas', { layers: [] });
    expect(empty.calls.map((c) => c.name)).toEqual(['save', 'restore']);

    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'capas', { layers: [layer, textLayer] });
    expect(m.fills()).toContain('#112233');
    expect(m.texts()).toEqual(['Cumpleaños Fran']);
  });

  it('renderFrame ignora capas inválidas y pasa las imágenes cargadas', () => {
    const src = '123e4567-e89b-42d3-a456-426614174000/frames/overlay.png';
    const img = {} as CanvasImageSource;
    const m = createMockCtx();
    renderFrame(
      m.ctx,
      600,
      800,
      'capas',
      { layers: [{ type: 'script' }, { type: 'image', src, full: true }] },
      { images: new Map([[src, img]]) },
    );
    expect(m.calls.find((c) => c.name === 'drawImage')?.args).toEqual([img, 0, 0, 600, 800]);
  });
});

describe('renderFrame', () => {
  it('dibuja las capas por defecto y no deja el contexto sucio', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'capas', defaultFrameParams('capas', { eventName: 'Cumple de Ana' }));

    expect(m.texts()).toEqual(['Cumple de Ana']);
    expect(m.count('save')).toBe(m.count('restore'));
  });

  it.each(['hacker', 'border', 'polaroid', 'film', 'viewfinder', 'banner', 'glow'])(
    'no dibuja nada con la plantilla %s (ya no existe)',
    (template) => {
      const m = createMockCtx();
      renderFrame(m.ctx, 600, 800, template, { layers: [{ type: 'shape', shape: 'rect', w: 0.5, h: 0.2, fill: '#112233' }] });
      expect(m.calls).toEqual([]);
    },
  );

  it('no dibuja nada con tamaño cero o negativo', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 0, 800, 'capas', { layers: [] });
    renderFrame(m.ctx, 600, -1, 'capas', { layers: [] });
    expect(m.calls).toEqual([]);
  });

  it('ignora parámetros inválidos en vez de dibujarlos', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'capas', { layers: [{ type: 'text', text: 'a', color: 'javascript:alert(1)' }] });
    expect(m.fills()).not.toContain('javascript:alert(1)');
    expect(m.texts()).toEqual([]);
  });

  it('es independiente de la resolución: la misma geometría relativa a 2 tamaños', () => {
    const rectLayer = { type: 'shape', shape: 'rect', w: 0.5, h: 0.2, fill: '#000000' };
    const small = createMockCtx();
    const big = createMockCtx();
    renderFrame(small.ctx, 300, 400, 'capas', { layers: [rectLayer] });
    renderFrame(big.ctx, 900, 1200, 'capas', { layers: [rectLayer] });

    const firstMove = (m: ReturnType<typeof createMockCtx>) => m.calls.find((c) => c.name === 'moveTo' || c.name === 'fillRect')!.args as number[];
    const s = firstMove(small);
    const b = firstMove(big);
    expect(b.map((v) => Math.round(v))).toEqual(s.map((v) => Math.round(v * 3)));
  });
});

describe('drawFittedText', () => {
  it('no dibuja texto vacío ni en un ancho nulo', () => {
    const m = createMockCtx();
    drawFittedText(m.ctx, '   ', 10, 10, 100, 20, { font: 'sans', color: '#000' });
    drawFittedText(m.ctx, 'hola', 10, 10, 0, 20, { font: 'sans', color: '#000' });
    expect(m.texts()).toEqual([]);
  });

  it('achica el tamaño hasta que cabe', () => {
    const m = createMockCtx();
    // A 40 px, "Hola mundo" (10 car.) mide 200; el ancho es 120 → tiene que bajar de 40.
    drawFittedText(m.ctx, 'Hola mundo', 0, 0, 120, 40, { font: 'sans', color: '#000' });
    expect(m.texts()).toEqual(['Hola mundo']);
    const font = String(m.calls.filter((c) => c.name === 'set:font').pop()!.args[0]);
    expect(parseInt(font.match(/(\d+)px/)![1], 10)).toBeLessThan(40);
  });

  it('si ni al tamaño mínimo cabe, lo trunca con "…" y nunca se pasa del ancho', () => {
    const m = createMockCtx();
    drawFittedText(m.ctx, 'a'.repeat(60), 0, 0, 80, 40, { font: 'sans', color: '#000' });
    const drawn = m.texts()[0];
    expect(drawn.endsWith('…')).toBe(true);
    expect(m.ctx.measureText(drawn).width).toBeLessThanOrEqual(80);
  });

  it('usa la pila de la tipografía elegida', () => {
    const m = createMockCtx();
    drawFittedText(m.ctx, 'Hola', 0, 0, 500, 20, { font: 'hand', color: '#000', weight: 'bold' });
    expect(String(m.calls.find((c) => c.name === 'set:font')!.args[0])).toMatch(/^bold \d+px "Bradley Hand"/);
  });
});
