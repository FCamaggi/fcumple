import { describe, expect, it } from 'vitest';
import {
  addLayer,
  createLayer,
  duplicateLayer,
  hitTest,
  layerBounds,
  moveLayer,
  removeLayer,
  reorderLayer,
  rotationFromPointer,
  scaleFactorFromPointers,
  scaleLayer,
  updateLayer,
} from './layerOps';
import { MAX_LAYERS, validateLayers, type FrameLayer } from './layers';

const EVENT = '123e4567-e89b-42d3-a456-426614174000';
const IMAGE = `${EVENT}/frames/overlay.png`;

const rect = (patch: Partial<FrameLayer> = {}) =>
  ({ type: 'shape', shape: 'rect', x: 0.5, y: 0.5, w: 0.5, h: 0.5, fill: '#111111', ...patch }) as FrameLayer;

describe('createLayer', () => {
  it.each([
    ['text', createLayer('text')],
    ['rect', createLayer('rect')],
    ['ellipse', createLayer('ellipse')],
    ['line', createLayer('line')],
    ['path', createLayer('path')],
    ['emoji', createLayer('emoji')],
    ['image', createLayer('image', { src: IMAGE })],
    ['image a pantalla completa', createLayer('image', { src: IMAGE, full: true })],
  ])('%s nace válida y centrada', (_name, layer) => {
    expect(validateLayers([layer])).toEqual({ ok: true });
    if (!('full' in layer && layer.full)) expect(layer).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('el texto nuevo usa una tipografía de Francisca y es editable', () => {
    expect(createLayer('text')).toMatchObject({ type: 'text', font: 'anton', text: 'Texto' });
  });
});

describe('addLayer', () => {
  it('agrega al final (arriba de todo) y devuelve el índice nuevo', () => {
    const { layers, index } = addLayer([rect()], createLayer('emoji'));
    expect(layers).toHaveLength(2);
    expect(index).toBe(1);
    expect(layers[1].type).toBe('emoji');
  });

  it('con el tope de capas no agrega y devuelve -1', () => {
    const full = Array.from({ length: MAX_LAYERS }, () => rect());
    const result = addLayer(full, createLayer('emoji'));
    expect(result.layers).toBe(full);
    expect(result.index).toBe(-1);
  });
});

describe('updateLayer / removeLayer', () => {
  it('actualiza una capa sin tocar las demás ni mutar la lista', () => {
    const list = [rect(), rect({ fill: '#222222' })];
    const next = updateLayer(list, 1, { fill: '#ff0000' } as Partial<FrameLayer>);
    expect(next[1]).toMatchObject({ fill: '#ff0000' });
    expect(next[0]).toBe(list[0]);
    expect(list[1]).toMatchObject({ fill: '#222222' });
    expect(updateLayer(list, 9, {})).toBe(list);
  });

  it('borra y devuelve la selección que corresponde (la anterior, o la primera)', () => {
    const list = [rect({ x: 0.1 }), rect({ x: 0.2 }), rect({ x: 0.3 })];
    expect(removeLayer(list, 2)).toMatchObject({ index: 1 });
    expect(removeLayer(list, 0)).toMatchObject({ index: 0 });
    expect(removeLayer([rect()], 0)).toEqual({ layers: [], index: -1 });
    expect(removeLayer(list, 9).layers).toBe(list);
  });
});

describe('duplicateLayer', () => {
  it('copia la capa justo encima, un poco corrida, y la selecciona', () => {
    const list = [rect({ x: 0.5, y: 0.5 }), rect({ x: 0.1 })];
    const { layers, index } = duplicateLayer(list, 0);
    expect(index).toBe(1);
    expect(layers).toHaveLength(3);
    expect(layers[1]).toMatchObject({ x: 0.53, y: 0.53 });
    expect(layers[0]).toMatchObject({ x: 0.5 });
  });

  it('no duplica con el tope de capas ni una imagen a pantalla completa', () => {
    const full = Array.from({ length: MAX_LAYERS }, () => rect());
    expect(duplicateLayer(full, 0).index).toBe(-1);
    const cover = createLayer('image', { src: IMAGE, full: true });
    expect(duplicateLayer([cover], 0).index).toBe(-1);
  });
});

describe('reorderLayer', () => {
  const abc = [rect({ x: 0.1 }), rect({ x: 0.2 }), rect({ x: 0.3 })];
  const xs = (list: FrameLayer[]) => list.map((l) => l.x);

  it('sube, baja, al frente y al fondo, y sigue a la capa', () => {
    expect(reorderLayer(abc, 0, 'up')).toMatchObject({ index: 1 });
    expect(xs(reorderLayer(abc, 0, 'up').layers)).toEqual([0.2, 0.1, 0.3]);
    expect(xs(reorderLayer(abc, 2, 'down').layers)).toEqual([0.1, 0.3, 0.2]);
    expect(reorderLayer(abc, 0, 'front')).toMatchObject({ index: 2 });
    expect(xs(reorderLayer(abc, 0, 'front').layers)).toEqual([0.2, 0.3, 0.1]);
    expect(xs(reorderLayer(abc, 2, 'back').layers)).toEqual([0.3, 0.1, 0.2]);
  });

  it('en los extremos no cambia nada', () => {
    expect(reorderLayer(abc, 2, 'up').layers).toBe(abc);
    expect(reorderLayer(abc, 0, 'down').layers).toBe(abc);
  });
});

describe('layerBounds', () => {
  it('centra la caja en el punto cuando el ancla es center', () => {
    expect(layerBounds(rect({ x: 0.5, y: 0.5, w: 0.5, h: 0.25 }), 600, 800)).toEqual({
      cx: 300,
      cy: 400,
      width: 300,
      height: 150,
      rotation: 0,
    });
  });

  it('con ancla tl la esquina cae en el punto', () => {
    const b = layerBounds(rect({ x: 0, y: 0, w: 0.5, h: 0.5, anchor: 'tl' }), 600, 800);
    expect(b).toMatchObject({ cx: 150, cy: 150, width: 300, height: 300 });
  });

  it('rota el centro alrededor del punto de anclaje', () => {
    const b = layerBounds(rect({ x: 0, y: 0, w: 0.5, h: 0.5, anchor: 'tl', rotation: 90 }), 600, 800);
    expect(b.cx).toBeCloseTo(-150);
    expect(b.cy).toBeCloseTo(150);
    expect(b.rotation).toBe(90);
  });

  it('la imagen a pantalla completa ocupa todo el lienzo', () => {
    expect(layerBounds(createLayer('image', { src: IMAGE, full: true }), 600, 800)).toEqual({
      cx: 300,
      cy: 400,
      width: 600,
      height: 800,
      rotation: 0,
    });
  });
});

describe('hitTest', () => {
  it('devuelve la capa de más arriba que contiene el punto, o -1', () => {
    const list = [rect({ w: 1, h: 1 }), rect({ w: 0.2, h: 0.2 })];
    expect(hitTest(list, 300, 400, 600, 800)).toBe(1);
    expect(hitTest(list, 100, 100, 600, 800)).toBe(0);
    expect(hitTest(list, 590, 790, 600, 800)).toBe(-1);
  });

  it('respeta la rotación', () => {
    // Una barra horizontal de 300 × 30 girada 90° queda vertical.
    const bar = [rect({ w: 0.5, h: 0.05, rotation: 90 })];
    expect(hitTest(bar, 300, 300, 600, 800)).toBe(0);
    expect(hitTest(bar, 450, 400, 600, 800)).toBe(-1);
  });

  it('una forma muy fina sigue siendo fácil de tocar', () => {
    const line = [createLayer('line')];
    expect(hitTest(line, 300, 408, 600, 800)).toBe(0);
  });

  it('la imagen a pantalla completa se puede seleccionar tocando cualquier punto', () => {
    expect(hitTest([createLayer('image', { src: IMAGE, full: true })], 10, 10, 600, 800)).toBe(0);
  });
});

describe('moveLayer', () => {
  it('mueve en fracciones del lienzo', () => {
    expect(moveLayer(rect({ x: 0.5, y: 0.5 }), 60, -80, 600, 800)).toMatchObject({ x: 0.6, y: 0.4 });
  });

  it('no se sale del rango que acepta la validación', () => {
    const moved = moveLayer(rect({ x: 0.5, y: 0.5 }), 99999, -99999, 600, 800);
    expect(moved).toMatchObject({ x: 2, y: -1 });
    expect(validateLayers([moved])).toEqual({ ok: true });
  });

  it('la imagen a pantalla completa no se mueve', () => {
    const cover = createLayer('image', { src: IMAGE, full: true });
    expect(moveLayer(cover, 50, 50, 600, 800)).toBe(cover);
  });
});

describe('scaleLayer', () => {
  it('escala el tamaño de cada tipo de capa', () => {
    expect(scaleLayer(rect({ w: 0.4, h: 0.2 }), 2)).toMatchObject({ w: 0.8, h: 0.4 });
    expect(scaleLayer({ type: 'text', text: 'a', size: 0.1, w: 1 }, 1.5)).toMatchObject({ size: 0.15, w: 1.5 });
    expect(scaleLayer({ type: 'emoji', emoji: '✨', size: 0.1 }, 2)).toMatchObject({ size: 0.2 });
    expect(scaleLayer({ type: 'image', src: IMAGE, w: 0.5, h: 0.25 }, 0.5)).toMatchObject({ w: 0.25, h: 0.125 });
  });

  it('una línea solo escala el largo', () => {
    const line = scaleLayer({ type: 'shape', shape: 'line', w: 0.4, stroke: '#ffffff' }, 2);
    expect(line).toMatchObject({ w: 0.8 });
    expect(line).not.toHaveProperty('h');
  });

  it('nunca produce una capa inválida: corta en los límites', () => {
    const huge = scaleLayer(rect({ w: 3, h: 3 }), 100);
    const tiny = scaleLayer({ type: 'text', text: 'a', size: 0.01, w: 0.1 }, 0.0001);
    expect(validateLayers([huge, tiny])).toEqual({ ok: true });
    expect(huge).toMatchObject({ w: 4, h: 4 });
  });

  it('la imagen a pantalla completa no se escala', () => {
    const cover = createLayer('image', { src: IMAGE, full: true });
    expect(scaleLayer(cover, 2)).toBe(cover);
  });
});

describe('gestos con el puntero', () => {
  it('el factor de escala es la razón de distancias al centro', () => {
    expect(scaleFactorFromPointers({ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 200, y: 100 })).toBe(2);
    expect(scaleFactorFromPointers({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 100 })).toBe(0.5);
  });

  it('con el puntero encima del centro no revienta', () => {
    expect(scaleFactorFromPointers({ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 100 })).toBe(1);
    expect(scaleFactorFromPointers({ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 100 })).toBeGreaterThan(0);
  });

  it('la rotación sale del ángulo del puntero: arriba es 0°, a la derecha 90°', () => {
    const c = { x: 100, y: 100 };
    expect(rotationFromPointer(c, { x: 100, y: 0 })).toBe(0);
    expect(rotationFromPointer(c, { x: 200, y: 100 })).toBe(90);
    expect(rotationFromPointer(c, { x: 100, y: 200 })).toBe(180);
    expect(rotationFromPointer(c, { x: 0, y: 100 })).toBe(-90);
  });

  it('imanta a múltiplos de 15° cuando está a menos de 3°', () => {
    const c = { x: 0, y: 0 };
    // 92° → 90°; 100° se queda.
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.sin(r) * 100, y: -Math.cos(r) * 100 };
    };
    expect(rotationFromPointer(c, at(92))).toBe(90);
    expect(rotationFromPointer(c, at(100))).toBeCloseTo(100, 5);
  });
});
