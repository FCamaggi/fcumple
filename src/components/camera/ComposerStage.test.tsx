import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { installPointerEventPolyfill, mockElementSize } from '../../test/pointerEvents';
import { createMockCtx } from '../../test/mockCanvas';
import { newPlacement, type StickerPlacement } from '../../lib/cameraAssets/stickers';
import ComposerStage, { fitBox } from './ComposerStage';
import type { CameraFrameOption, CameraStickerOption } from './types';

beforeAll(installPointerEventPolyfill);

describe('fitBox', () => {
  it('encaja la mayor caja con esa proporción dentro del contenedor', () => {
    expect(fitBox({ w: 400, h: 800 }, 3 / 4)).toEqual({ w: 400, h: 400 / (3 / 4) });
    expect(fitBox({ w: 800, h: 400 }, 3 / 4)).toEqual({ w: 300, h: 400 });
    expect(fitBox({ w: 300, h: 400 }, 4 / 3)).toEqual({ w: 300, h: 225 });
  });

  it('devuelve 0 con datos inválidos', () => {
    expect(fitBox({ w: 0, h: 400 }, 1)).toEqual({ w: 0, h: 0 });
    expect(fitBox({ w: 400, h: 400 }, 0)).toEqual({ w: 0, h: 0 });
    expect(fitBox({ w: 400, h: 400 }, Number.NaN)).toEqual({ w: 0, h: 0 });
  });
});

const optionList: CameraStickerOption[] = [
  { id: 'e1', label: '🎉', asset: { kind: 'emoji', emoji: '🎉' } },
  { id: 'i1', label: 'imagen', asset: { kind: 'image', image: {} as CanvasImageSource }, previewSrc: 'https://x/a.webp' },
];
const options = new Map<string, CameraStickerOption>(optionList.map((o) => [o.id, o]));

let restoreSize: () => void;
beforeEach(() => {
  // Contenedor de 400 × 400 y proporción 1:1 → escenario de 400 × 400.
  restoreSize = mockElementSize(400, 400);
  // jsdom no trae canvas: sin esto cada render imprime un "Not implemented".
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCtx().ctx);
});
afterEach(() => {
  restoreSize();
  vi.restoreAllMocks();
});

function setup(
  placements: StickerPlacement[],
  extra: { frame?: CameraFrameOption | null; selectedUid?: string | null } = {},
) {
  const onSelect = vi.fn();
  const onChange = vi.fn();
  render(
    <ComposerStage
      aspect={1}
      frame={extra.frame ?? null}
      placements={placements}
      options={options}
      selectedUid={extra.selectedUid ?? null}
      onSelect={onSelect}
      onChange={onChange}
    >
      <video data-testid="video" />
    </ComposerStage>,
  );
  return { onSelect, onChange, stage: screen.getByTestId('composer-stage') };
}

describe('ComposerStage', () => {
  it('mide el escenario con la proporción de la foto y muestra el video', () => {
    const { stage } = setup([]);
    expect(stage).toHaveStyle({ width: '400px', height: '400px' });
    expect(screen.getByTestId('video')).toBeInTheDocument();
  });

  it('dibuja el marco sobre un canvas del tamaño del escenario', () => {
    const m = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m.ctx);
    const draw = vi.fn();
    setup([], { frame: { id: 'f1', label: 'Borde', draw } });

    expect(m.count('clearRect')).toBe(1);
    expect(draw).toHaveBeenCalledTimes(1);
    const [ctx, w, h] = draw.mock.calls[0];
    expect(ctx).toBe(m.ctx);
    // devicePixelRatio de jsdom = 1
    expect([w, h]).toEqual([400, 400]);
  });

  it('"Sin marco" (draw nulo) limpia el canvas y no dibuja nada', () => {
    const m = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(m.ctx);
    setup([], { frame: { id: 'none', label: 'Sin marco', draw: null } });
    expect(m.count('clearRect')).toBe(1);
  });

  it('posiciona cada sticker con su centro, tamaño y rotación', () => {
    setup([{ ...newPlacement('e1', 'u1'), x: 0.25, y: 0.75, scale: 2, rotation: 1 }], { selectedUid: 'u1' });
    const el = screen.getByLabelText('Sticker 🎉 (seleccionado)');
    expect(el).toHaveStyle({ left: '25%', top: '75%', width: '160px', height: '160px' });
    expect(el.style.transform).toBe('translate(-50%, -50%) rotate(1rad)');
    expect(el).toHaveAttribute('data-selected', 'true');
  });

  it('muestra stickers de imagen con su URL y omite los que ya no existen', () => {
    setup([newPlacement('i1', 'u1'), newPlacement('desconocido', 'u2')]);
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://x/a.webp');
    expect(document.querySelectorAll('[data-sticker-uid]')).toHaveLength(1);
  });

  it('tocar un sticker lo selecciona; tocar el fondo deselecciona', () => {
    const { onSelect, stage } = setup([newPlacement('e1', 'u1')]);
    fireEvent.pointerDown(screen.getByLabelText('Sticker 🎉'), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onSelect).toHaveBeenLastCalledWith('u1');
    fireEvent.pointerUp(stage, { pointerId: 1 });

    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 10, clientY: 10 });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('arrastrar con un dedo mueve el sticker en fracciones del escenario', () => {
    const { onChange, stage } = setup([newPlacement('e1', 'u1')], { selectedUid: 'u1' });
    fireEvent.pointerDown(screen.getByLabelText(/Sticker 🎉/), { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 240, clientY: 180 });

    const next = onChange.mock.calls.at(-1)![0] as StickerPlacement;
    expect(next.x).toBeCloseTo(0.6);
    expect(next.y).toBeCloseTo(0.45);
  });

  it('arrastrar fuera de la foto se queda en el borde', () => {
    const { onChange, stage } = setup([newPlacement('e1', 'u1')], { selectedUid: 'u1' });
    fireEvent.pointerDown(screen.getByLabelText(/Sticker 🎉/), { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 9000, clientY: -9000 });
    const next = onChange.mock.calls.at(-1)![0] as StickerPlacement;
    expect([next.x, next.y]).toEqual([1, 0]);
  });

  it('pellizcar con dos dedos escala y gira (el segundo dedo puede caer fuera del sticker)', () => {
    const { onChange, stage } = setup([newPlacement('e1', 'u1')], { selectedUid: 'u1' });
    fireEvent.pointerDown(screen.getByLabelText(/Sticker 🎉/), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 200, clientY: 100 });

    // Los dedos se separan al doble de distancia y giran 90°.
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 100, clientY: 300 });

    const next = onChange.mock.calls.at(-1)![0] as StickerPlacement;
    expect(next.scale).toBeCloseTo(2);
    expect(next.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('al levantar un dedo del pellizco, el otro sigue arrastrando sin saltos', () => {
    const { onChange, stage } = setup([newPlacement('e1', 'u1')], { selectedUid: 'u1' });
    fireEvent.pointerDown(screen.getByLabelText(/Sticker 🎉/), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(stage, { pointerId: 1 });

    onChange.mockClear();
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 240, clientY: 100 });
    const next = onChange.mock.calls.at(-1)![0] as StickerPlacement;
    expect(next.x).toBeCloseTo(0.6);
  });

  it('un movimiento sin gesto activo no cambia nada', () => {
    const { onChange, stage } = setup([newPlacement('e1', 'u1')]);
    fireEvent.pointerMove(stage, { pointerId: 9, clientX: 50, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
