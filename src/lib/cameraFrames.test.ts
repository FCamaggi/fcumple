import { describe, expect, it, vi } from 'vitest';
import { FRAME_IDS, FRAME_IMAGE_SRC, FRAME_LABELS, drawFrame, getFrameIndexAfterSwipe } from './cameraFrames';

/**
 * Lo que sí es testable acá sin un <canvas>/<img> reales (mismo criterio
 * que cameraControls.test.ts): la navegación pura entre marcos (índice +
 * índice dado un swipe), que cada marco real tenga una ruta de imagen y un
 * label, y que `drawFrame` delegue en `ctx.drawImage` cuando recibe una
 * imagen ya cargada y no haga nada cuando recibe `null` (ni marco ni
 * imagen sin cargar). No se verifica el resultado visual/pixel a pixel --
 * eso solo se puede juzgar a ojo (igual que el resto del pipeline de
 * captura, ver CameraCapture.tsx).
 */

function makeMockCtx() {
  return { drawImage: vi.fn() };
}

describe('FRAME_IDS', () => {
  it('starts with "none" (no frame applied) as the swipe starting point', () => {
    expect(FRAME_IDS[0]).toBe('none');
  });

  it('has 7-8 entries total (~6-7 real frames plus "none")', () => {
    expect(FRAME_IDS.length).toBeGreaterThanOrEqual(7);
    expect(FRAME_IDS.length).toBeLessThanOrEqual(8);
  });

  it('has a human label for every frame id', () => {
    for (const id of FRAME_IDS) {
      expect(FRAME_LABELS[id]).toBeTruthy();
    }
  });

  it('has an image path for every frame id except "none"', () => {
    for (const id of FRAME_IDS) {
      if (id === 'none') {
        expect(FRAME_IMAGE_SRC[id]).toBeUndefined();
      } else {
        expect(FRAME_IMAGE_SRC[id]).toMatch(/^\/marcos\/\d\.png$/);
      }
    }
  });
});

describe('getFrameIndexAfterSwipe', () => {
  it('moves to the next frame on a left swipe', () => {
    expect(getFrameIndexAfterSwipe(0, 'left', 4)).toBe(1);
  });

  it('moves to the previous frame on a right swipe', () => {
    expect(getFrameIndexAfterSwipe(2, 'right', 4)).toBe(1);
  });

  it('wraps around past the last frame on a left swipe', () => {
    expect(getFrameIndexAfterSwipe(3, 'left', 4)).toBe(0);
  });

  it('wraps around past the first frame on a right swipe', () => {
    expect(getFrameIndexAfterSwipe(0, 'right', 4)).toBe(3);
  });

  it('stays put when there is only one frame', () => {
    expect(getFrameIndexAfterSwipe(0, 'left', 1)).toBe(0);
    expect(getFrameIndexAfterSwipe(0, 'right', 1)).toBe(0);
  });
});

describe('drawFrame', () => {
  it('does not draw anything when the image is null (either "none" or not loaded yet)', () => {
    const ctx = makeMockCtx();
    drawFrame(ctx as unknown as CanvasRenderingContext2D, null, 800, 600);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('draws the given image stretched to fill the canvas when it is loaded', () => {
    const ctx = makeMockCtx();
    const image = {} as HTMLImageElement;
    drawFrame(ctx as unknown as CanvasRenderingContext2D, image, 800, 600);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600);
  });

  it('never throws on a tiny or unusual canvas size', () => {
    const ctx = makeMockCtx();
    const image = {} as HTMLImageElement;
    expect(() => drawFrame(ctx as unknown as CanvasRenderingContext2D, image, 1, 1)).not.toThrow();
    expect(() => drawFrame(ctx as unknown as CanvasRenderingContext2D, null, 1, 1)).not.toThrow();
  });
});
