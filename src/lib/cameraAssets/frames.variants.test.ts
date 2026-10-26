import { describe, expect, it } from 'vitest';
import {
  VARIANT_RATIOS,
  mirrorVariantsToLayers,
  sanitizeFrameParams,
  validateFrameParams,
  variantLayers,
  withVariant,
} from './frames';
import { MAX_LAYERS, MAX_LAYERS_PARAMS_LENGTH, MAX_VARIANTS_PARAMS_LENGTH } from './layers';

const rect = { type: 'shape', shape: 'rect', w: 0.5, h: 0.2, fill: '#112233' } as const;
const text = { type: 'text', text: 'Cumpleaños Fran', font: 'display', color: '#ff4fa3' } as const;
const path = { type: 'shape', shape: 'path', w: 0.3, h: 0.3, d: `M0 0${' L10 10'.repeat(80)}`, fill: '#000000' };

describe('variantes por proporción: validación (misma regla que la base)', () => {
  it('declara las cuatro proporciones', () => {
    expect([...VARIANT_RATIOS].sort()).toEqual(['1:1', '3:4', '4:3', '9:16']);
  });

  it('acepta variantes parciales, vacías y con layers de compatibilidad', () => {
    expect(validateFrameParams({ variants: {} })).toEqual({ ok: true });
    expect(validateFrameParams({ variants: { '3:4': { layers: [] } } })).toEqual({ ok: true });
    expect(
      validateFrameParams({
        layers: [rect],
        variants: { '3:4': { layers: [rect] }, '1:1': { layers: [text] }, '9:16': { layers: [] }, '4:3': { layers: [rect] } },
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    ['no es objeto', { variants: [] }],
    ['es una cadena', { variants: 'x' }],
    ['proporción desconocida', { variants: { '16:9': { layers: [] } } }],
    ['variante sin layers', { variants: { '3:4': {} } }],
    ['variante con clave ajena', { variants: { '3:4': { layers: [], extra: 1 } } }],
    ['variante no es objeto', { variants: { '3:4': [] } }],
    ['layers no es lista', { variants: { '3:4': { layers: 'x' } } }],
    ['capa inválida', { variants: { '3:4': { layers: [{ ...rect, fill: 'red' }] } } }],
  ])('rechaza %s', (_n, params) => {
    expect(validateFrameParams(params).ok).toBe(false);
  });

  it('el tope de capas es por variante', () => {
    const full = Array.from({ length: MAX_LAYERS }, () => rect);
    expect(validateFrameParams({ variants: { '3:4': { layers: full }, '1:1': { layers: full } } })).toEqual({ ok: true });
    expect(validateFrameParams({ variants: { '3:4': { layers: [...full, rect] } } }).ok).toBe(false);
  });

  it('el tope de 16 KB es por variante y el total llega a 64 KB', () => {
    const variantOf = (n: number) => ({ layers: Array.from({ length: n }, () => path) });
    expect(JSON.stringify(variantOf(24)).length).toBeLessThanOrEqual(MAX_LAYERS_PARAMS_LENGTH);
    expect(JSON.stringify(variantOf(28)).length).toBeGreaterThan(MAX_LAYERS_PARAMS_LENGTH);
    const ok = { variants: { '3:4': variantOf(24), '4:3': variantOf(24), '1:1': variantOf(24) } };
    expect(JSON.stringify(ok).length).toBeGreaterThan(MAX_LAYERS_PARAMS_LENGTH);
    expect(JSON.stringify(ok).length).toBeLessThanOrEqual(MAX_VARIANTS_PARAMS_LENGTH);
    expect(validateFrameParams(ok)).toEqual({ ok: true });
    expect(validateFrameParams({ variants: { '3:4': variantOf(28) } }).ok).toBe(false);
  });

  it('el total de params con variantes no pasa de 64 KB', () => {
    const variantOf = (n: number) => ({ layers: Array.from({ length: n }, () => path) });
    const over = {
      layers: variantOf(24).layers,
      variants: { '3:4': variantOf(24), '4:3': variantOf(24), '1:1': variantOf(24), '9:16': variantOf(24) },
    };
    expect(JSON.stringify(over).length).toBeGreaterThan(MAX_VARIANTS_PARAMS_LENGTH);
    expect(validateFrameParams(over).ok).toBe(false);
  });

  it('con variantes, layers de compatibilidad también tiene tope de 16 KB', () => {
    const big = Array.from({ length: 28 }, () => path);
    expect(validateFrameParams({ layers: big, variants: { '3:4': { layers: [] } } }).ok).toBe(false);
  });
});

describe('variantes por proporción: sanitize y lectura', () => {
  it('sanitize conserva las variantes válidas y descarta lo inválido', () => {
    const out = sanitizeFrameParams({
      variants: { '3:4': { layers: [rect, { type: 'script' }, text] }, '16:9': { layers: [rect] }, '1:1': 'x' },
    });
    expect(out).toEqual({ variants: { '3:4': { layers: [rect, text] } } });
    expect(sanitizeFrameParams({ variants: 'x' })).toEqual({});
  });

  it('variantLayers devuelve la variante pedida', () => {
    const params = { variants: { '3:4': { layers: [rect] }, '1:1': { layers: [] } } };
    expect(variantLayers(params, '3:4')).toEqual([rect]);
    expect(variantLayers(params, '1:1')).toEqual([]);
    expect(variantLayers(params, '9:16')).toBeUndefined();
  });

  it('sin variants, layers vale para todas las proporciones (compatibilidad)', () => {
    for (const ratio of VARIANT_RATIOS) expect(variantLayers({ layers: [rect] }, ratio)).toEqual([rect]);
    expect(variantLayers({}, '3:4')).toBeUndefined();
  });

  it('withVariant reemplaza una variante sin tocar las demás y espeja 3:4 en layers', () => {
    const base = { variants: { '1:1': { layers: [text] } } };
    const next = withVariant(base, '3:4', [rect]);
    expect(next.variants).toEqual({ '1:1': { layers: [text] }, '3:4': { layers: [rect] } });
    expect(next.layers).toEqual([rect]);
    // editar otra proporción no cambia el espejo
    expect(withVariant(next, '1:1', [])).toMatchObject({ layers: [rect], variants: { '1:1': { layers: [] } } });
  });

  it('withVariant migra layers antiguo a las cuatro variantes antes de editar una', () => {
    const next = withVariant({ layers: [rect] }, '9:16', [text]);
    expect(next.variants).toEqual({
      '3:4': { layers: [rect] },
      '4:3': { layers: [rect] },
      '1:1': { layers: [rect] },
      '9:16': { layers: [text] },
    });
  });

  it('mirrorVariantsToLayers deja layers igual a la variante 3:4, o lo quita si no existe', () => {
    expect(mirrorVariantsToLayers({ variants: { '3:4': { layers: [rect] } }, layers: [text] }).layers).toEqual([rect]);
    expect(mirrorVariantsToLayers({ variants: { '1:1': { layers: [rect] } }, layers: [text] })).not.toHaveProperty('layers');
  });
});
