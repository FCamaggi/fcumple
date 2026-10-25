import { describe, expect, it } from 'vitest';
import { createMockCtx } from '../../test/mockCanvas';
import { renderFrame } from './frames';
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_DIMENSIONS,
  applyKonvaNodeTransform,
  computeSmartGuides,
  fitStageSize,
  layerToKonvaGeometry,
  pixelToAnchoredPosition,
  snapRotationAngle,
} from './konvaParity';
import { layerBounds } from './layerOps';
import { validateLayers, type FrameLayer } from './layers';

const EVENT = '123e4567-e89b-42d3-a456-426614174000';

describe('Paridad Konva <-> renderFrame (Etapa 1.5.3)', () => {
  const sampleLayers: FrameLayer[] = [
    {
      type: 'shape',
      shape: 'rect',
      box: { l: 0.026, r: 0.026, b: 0.026 },
      h: 0.185,
      fill: '#0d0b12',
      opacity: 0.84,
      radius: 0.018,
    },
    {
      type: 'asset',
      asset: 'pack:halloween-neon/telarana',
      x: 0,
      y: 0,
      dx: 0.03,
      dy: 0.03,
      w: 0.28,
      h: 0.28,
      anchor: 'tl',
      tint: '#ff2f92',
    },
    {
      type: 'asset',
      asset: 'pack:halloween-neon/orejas-conejita',
      x: 0,
      y: 1,
      dx: 0.15,
      dy: -0.26,
      w: 0.23,
      h: 0.23,
      rotation: -5,
      tint: '#ff2f92',
    },
    {
      type: 'text',
      text: 'HALLOWEEN PARTY',
      x: 0.5,
      "y": 1,
      dy: -0.14,
      size: 0.092,
      w: 0.7,
      font: 'anton',
      color: '#ff2f92',
      strokeColor: '#0d0b12',
      strokeWidth: 0.012,
    },
    {
      type: 'emoji',
      emoji: '🦇',
      x: 1,
      y: 0,
      dx: -0.12,
      dy: 0.12,
      size: 0.1,
      rotation: 15,
      anchor: 'tr',
    },
    {
      type: 'image',
      src: `${EVENT}/frames/overlay.png`,
      full: true,
    },
  ];

  it.each(ASPECT_RATIOS)(
    'en proporción %s, layerToKonvaGeometry coincide 1:1 con layerBounds y con las transformaciones de renderFrame',
    (ratio) => {
      const { width, height } = ASPECT_RATIO_DIMENSIONS[ratio];
      const img = {} as CanvasImageSource;
      const assets = {
        images: new Map<string, CanvasImageSource>([
          ['pack:halloween-neon/telarana@#ff2f92', img],
          ['pack:halloween-neon/orejas-conejita@#ff2f92', img],
          [`${EVENT}/frames/overlay.png`, img],
        ]),
      };

      for (const layer of sampleLayers) {
        const konva = layerToKonvaGeometry(layer, width, height);
        const bounds = layerBounds(layer, width, height);

        expect(konva.cx).toBeCloseTo(bounds.cx, 5);
        expect(konva.cy).toBeCloseTo(bounds.cy, 5);
        expect(konva.width).toBeCloseTo(bounds.width, 5);
        expect(konva.height).toBeCloseTo(bounds.height, 5);
        expect(konva.rotation).toBeCloseTo(bounds.rotation, 5);

        // Verifica contra lo que realmente ejecuta renderFrame sobre el Canvas 2D
        const mock = createMockCtx();
        renderFrame(mock.ctx, width, height, 'capas', { layers: [layer] }, assets);

        if (layer.type === 'image' && layer.full) {
          expect(mock.calls.find((c) => c.name === 'drawImage')?.args).toEqual([img, 0, 0, width, height]);
        } else if (layer.type === 'shape' && layer.box) {
          expect(mock.calls.some((c) => c.name === 'translate')).toBe(false);
        } else {
          const translateCall = mock.calls.find((c) => c.name === 'translate');
          expect(translateCall?.args[0]).toBeCloseTo(konva.x, 5);
          expect(translateCall?.args[1]).toBeCloseTo(konva.y, 5);

          if (layer.type === 'asset') {
            const drawCall = mock.calls.find((c) => c.name === 'drawImage');
            expect(drawCall?.args).toEqual([img, -konva.offsetX, -konva.offsetY, konva.width, konva.height]);
          }
        }
      }
    },
  );

  it('conversión bidireccional: soltar un nodo en Konva calcula su anclaje (x, y en 0|0.5|1 + dx, dy) y reconstruye el píxel exacto', () => {
    const w = 270;
    const h = 360;
    const initial: FrameLayer = {
      type: 'asset',
      asset: 'pack:halloween-neon/murcielago',
      x: 0.5,
      y: 0.5,
      w: 0.2,
      h: 0.15,
    };

    // 1. Esquina superior izquierda -> x: 0, y: 0 con dx, dy positivos
    const topLeft = applyKonvaNodeTransform(initial, { x: 40.5, y: 54, scaleX: 1.5, scaleY: 1.5, rotation: 44 }, w, h);
    expect(validateLayers([topLeft])).toEqual({ ok: true });
    expect(topLeft).toMatchObject({ x: 0, y: 0, dx: 0.15, dy: 0.2, w: 0.3, h: 0.225, rotation: 45 });
    const roundTripTL = layerToKonvaGeometry(topLeft, w, h);
    expect(roundTripTL.x).toBeCloseTo(40.5, 2);
    expect(roundTripTL.y).toBeCloseTo(54, 2);

    // 2. Esquina inferior derecha -> x: 1, y: 1 con dx, dy negativos
    const bottomRight = applyKonvaNodeTransform(initial, { x: 243, y: 333, rotation: -88 }, w, h);
    expect(validateLayers([bottomRight])).toEqual({ ok: true });
    expect(bottomRight).toMatchObject({ x: 1, y: 1, dx: -0.1, dy: -0.1, rotation: -90 });
    const roundTripBR = layerToKonvaGeometry(bottomRight, w, h);
    expect(roundTripBR.x).toBeCloseTo(243, 2);
    expect(roundTripBR.y).toBeCloseTo(333, 2);

    // Al cambiar el lienzo a 9:16 (270 x 480), la distancia al borde inferior sigue siendo 0.1 * 270 = 27 px
    const inStory = layerToKonvaGeometry(bottomRight, 270, 480);
    expect(inStory.x).toBeCloseTo(270 - 27, 2);
    expect(inStory.y).toBeCloseTo(480 - 27, 2);

    // 3. Centro exacto -> x: 0.5, y: 0.5 sin dx ni dy residuales
    const centered = applyKonvaNodeTransform(topLeft, { x: 135, y: 180, rotation: 2 }, w, h);
    expect(centered).toMatchObject({ x: 0.5, y: 0.5, rotation: 0 });
    expect(centered).not.toHaveProperty('dx');
    expect(centered).not.toHaveProperty('dy');
  });

  it('snapRotationAngle imanta a 0°, ±45°, ±90°, ±135°, 180° y respeta ángulos intermedios', () => {
    expect(snapRotationAngle(2)).toBe(0);
    expect(snapRotationAngle(43)).toBe(45);
    expect(snapRotationAngle(94)).toBe(90);
    expect(snapRotationAngle(-177)).toBe(180);
    expect(snapRotationAngle(22)).toBe(22);
  });

  it('computeSmartGuides imanta al centro horizontal y vertical del lienzo', () => {
    expect(computeSmartGuides(132, 178, 270, 360)).toEqual({
      x: 135,
      y: 180,
      verticalCenter: true,
      horizontalCenter: true,
    });
    expect(computeSmartGuides(50, 180, 270, 360)).toEqual({
      x: 50,
      y: 180,
      verticalCenter: false,
      horizontalCenter: true,
    });
  });

  it('una capa bloqueada (locked: true) no es arrastrable ni transformable en Konva', () => {
    const lockedLayer: FrameLayer = {
      type: 'asset',
      asset: 'pack:halloween-neon/murcielago',
      w: 0.2,
      h: 0.2,
      locked: true,
    };
    const geom = layerToKonvaGeometry(lockedLayer, 270, 360);
    expect(geom.draggable).toBe(false);
    expect(geom.transformable).toBe(false);
    expect(applyKonvaNodeTransform(lockedLayer, { x: 10, y: 10, scaleX: 2, scaleY: 2 }, 270, 360)).toBe(lockedLayer);
  });

  it('pixelToAnchoredPosition elige el borde correcto según el tercio del lienzo', () => {
    expect(pixelToAnchoredPosition(27, 36, 270, 360)).toEqual({ x: 0, y: 0, dx: 0.1, dy: 0.1333 });
    expect(pixelToAnchoredPosition(135, 180, 270, 360)).toEqual({ x: 0.5, y: 0.5 });
    expect(pixelToAnchoredPosition(243, 324, 270, 360)).toEqual({ x: 1, y: 1, dx: -0.1, dy: -0.1333 });
  });
});

describe('fitStageSize', () => {
  it('con espacio de sobra crece hasta el tope y conserva la proporción', () => {
    const { width, height } = fitStageSize('3:4', 5000, 5000);
    expect(width / height).toBeCloseTo(270 / 360, 2);
    expect(width).toBe(810); // 270 × 3
  });

  it('manda el eje más escaso: el alto en vertical, el ancho en horizontal', () => {
    expect(fitStageSize('3:4', 900, 540)).toEqual({ width: 405, height: 540 });
    expect(fitStageSize('4:3', 540, 900)).toEqual({ width: 540, height: 405 });
  });

  it('no baja del mínimo ni se rompe con valores no finitos', () => {
    expect(fitStageSize('1:1', 10, 10)).toEqual({ width: 162, height: 162 }); // 270 × 0,6
    expect(fitStageSize('1:1', Number.NaN, 400)).toEqual({ width: 270, height: 270 });
  });

  it.each(ASPECT_RATIOS)('%s: la geometría de las capas escala con el lienzo (paridad a cualquier tamaño)', (ratio) => {
    const layer: FrameLayer = { type: 'asset', asset: 'pack:halloween-neon/tiara', x: 1, y: 0, dx: -0.04, dy: 0.04, w: 0.3, h: 0.3, rotation: 8 };
    const base = ASPECT_RATIO_DIMENSIONS[ratio];
    const big = fitStageSize(ratio, 5000, 5000);
    const k = big.width / base.width;
    const a = layerToKonvaGeometry(layer, base.width, base.height);
    const b = layerToKonvaGeometry(layer, big.width, big.height);
    for (const key of ['x', 'y', 'width', 'height', 'cx', 'cy'] as const) {
      expect(b[key]).toBeCloseTo(a[key] * k, 0);
    }
    expect(b.rotation).toBe(a.rotation);
  });
});
