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

  it('prellena textos con el nombre y la fecha del evento (recortados a 60)', () => {
    const banner = defaultFrameParams('banner', { eventName: 'Cumple de Ana', eventDate: '05/12/2026' });
    expect(banner).toMatchObject({ title: 'Cumple de Ana', subtitle: '05/12/2026', position: 'bottom' });
    expect(defaultFrameParams('polaroid', { eventName: 'x'.repeat(200) }).caption).toHaveLength(MAX_TEXT_LENGTH);
    expect(defaultFrameParams('polaroid').caption).toBeUndefined();
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
    expect(withName.layers?.[0]).toMatchObject({ type: 'text', text: 'Cumpleaños Fran' });
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
  it.each(FRAME_TEMPLATES.filter((t) => t !== 'capas'))('%s dibuja algo con parámetros por defecto y no deja el contexto sucio', (template) => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, template, defaultFrameParams(template, { eventName: 'Cumple de Ana', eventDate: '05/12/2026' }));

    expect(m.calls.length).toBeGreaterThan(2);
    expect(m.count('save')).toBe(1);
    expect(m.count('restore')).toBe(1);
  });

  it('no dibuja nada con una plantilla desconocida ni con tamaño cero', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'hacker', {});
    renderFrame(m.ctx, 0, 800, 'border', {});
    renderFrame(m.ctx, 600, -1, 'border', {});
    expect(m.calls).toEqual([]);
  });

  it('ignora parámetros inválidos en vez de dibujarlos', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'banner', { primaryColor: 'javascript:alert(1)', title: 'a'.repeat(500), textColor: 'red' });
    expect(m.fills()).not.toContain('javascript:alert(1)');
    expect(m.texts()).toEqual([]);
  });

  it('borde: recorta el interior con la regla evenodd y usa el color pedido', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'border', { primaryColor: '#123456', thickness: 0.1, radius: 0 });
    expect(m.fills()).toContain('#123456');
    expect(m.calls.find((c) => c.name === 'fill')?.args).toEqual(['evenodd']);
    // El hueco interior se inset por el grosor: 0,1 × 600 = 60.
    expect(m.calls.find((c) => c.name === 'moveTo')?.args).toEqual([60, 60]);
  });

  it('es independiente de la resolución: la misma geometría relativa a 2 tamaños', () => {
    const small = createMockCtx();
    const big = createMockCtx();
    renderFrame(small.ctx, 300, 400, 'banner', { title: 'Hola', primaryColor: '#000000' });
    renderFrame(big.ctx, 900, 1200, 'banner', { title: 'Hola', primaryColor: '#000000' });

    const rect = (m: ReturnType<typeof createMockCtx>) => m.calls.find((c) => c.name === 'fillRect')!.args as number[];
    const [sx, sy, sw, sh] = rect(small);
    const [bx, by, bw, bh] = rect(big);
    expect([bx, by, bw, bh]).toEqual([sx * 3, sy * 3, sw * 3, sh * 3]);
  });

  it('banner: va arriba o abajo según position y dibuja título y subtítulo', () => {
    const top = createMockCtx();
    const bottom = createMockCtx();
    renderFrame(top.ctx, 600, 800, 'banner', { title: 'Título', subtitle: 'Sub', position: 'top' });
    renderFrame(bottom.ctx, 600, 800, 'banner', { title: 'Título', subtitle: 'Sub', position: 'bottom' });

    expect(top.calls.find((c) => c.name === 'fillRect')!.args[1]).toBe(0);
    expect(bottom.calls.find((c) => c.name === 'fillRect')!.args[1]).toBeGreaterThan(600);
    expect(top.texts()).toEqual(['Título', 'Sub']);
  });

  it('polaroid: sin leyenda no dibuja texto; con leyenda, la dibuja', () => {
    const without = createMockCtx();
    const withCaption = createMockCtx();
    renderFrame(without.ctx, 600, 800, 'polaroid', {});
    renderFrame(withCaption.ctx, 600, 800, 'polaroid', { caption: 'Para siempre' });
    expect(without.texts()).toEqual([]);
    expect(withCaption.texts()).toEqual(['Para siempre']);
  });

  it('visor: dibuja REC y el texto de abajo', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'viewfinder', { title: '05/12/2026' });
    expect(m.texts()).toEqual(['REC', '05/12/2026']);
    expect(m.count('stroke')).toBe(1);
  });

  it('rollo: dibuja las dos franjas y perforaciones', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'film', { title: 'Noche' });
    expect(m.count('fillRect')).toBe(2);
    expect(m.count('arcTo')).toBeGreaterThan(8);
    expect(m.texts()).toEqual(['Noche']);
  });

  it('destello: cuatro degradés que terminan transparentes', () => {
    const m = createMockCtx();
    renderFrame(m.ctx, 600, 800, 'glow', { primaryColor: '#ff0000', secondaryColor: '#0000ff' });
    expect(m.gradients).toHaveLength(4);
    for (const g of m.gradients) {
      expect(g.stops[1][1]).toMatch(/, 0\)$/);
    }
    expect(m.gradients[0].stops[0][1]).toBe('rgba(255, 0, 0, 0.75)');
    expect(m.gradients[2].stops[0][1]).toBe('rgba(0, 0, 255, 0.75)');
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
