import { describe, expect, it, vi } from 'vitest';
import { FRAME_IDS, FRAME_LABELS, drawFrame, getFrameIndexAfterSwipe } from './cameraFrames';

/**
 * Lo que sí es testable acá sin un <canvas> real (mismo criterio que
 * cameraControls.test.ts): la navegación pura entre marcos (índice + índice
 * dado un swipe) y que `drawFrame` invoque al menos una llamada de dibujo
 * en un contexto 2D *mockeado* para cada marco real, y ninguna para "sin
 * marco". No se verifica el resultado visual/pixel a pixel -- eso solo se
 * puede juzgar a ojo (igual que el resto del pipeline de captura, ver
 * CameraCapture.tsx).
 */

function makeMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
  };
}

function drawCallCount(ctx: ReturnType<typeof makeMockCtx>) {
  return (
    ctx.fillRect.mock.calls.length +
    ctx.strokeRect.mock.calls.length +
    ctx.stroke.mock.calls.length +
    ctx.fill.mock.calls.length +
    ctx.fillText.mock.calls.length
  );
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
  it('does not draw anything for "none"', () => {
    const ctx = makeMockCtx();
    drawFrame(ctx as unknown as CanvasRenderingContext2D, 'none', 800, 600);
    expect(drawCallCount(ctx)).toBe(0);
  });

  it.each(FRAME_IDS.filter((id) => id !== 'none'))('draws at least one shape for "%s"', (id) => {
    const ctx = makeMockCtx();
    drawFrame(ctx as unknown as CanvasRenderingContext2D, id, 800, 600);
    expect(drawCallCount(ctx)).toBeGreaterThan(0);
  });

  it('never throws on a tiny or unusual canvas size', () => {
    for (const id of FRAME_IDS) {
      const ctx = makeMockCtx();
      expect(() => drawFrame(ctx as unknown as CanvasRenderingContext2D, id, 1, 1)).not.toThrow();
    }
  });
});
