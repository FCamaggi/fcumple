import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createMockCtx } from '../../test/mockCanvas';
import FramePreview from './FramePreview';

const SRC = '123e4567-e89b-42d3-a456-426614174000/frames/overlay.png';

// Imagen que "carga" al instante.
class FakeImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

let mock: ReturnType<typeof createMockCtx>;

beforeEach(() => {
  mock = createMockCtx();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mock.ctx);
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => vi.unstubAllGlobals());

describe('FramePreview', () => {
  it('dibuja un marco de plantilla con el mismo renderFrame de la cámara', () => {
    render(<FramePreview template="capas" params={{ layers: [{ type: 'text', text: 'Hola', font: 'display', color: '#ffffff' }] }} width={90} height={120} />);
    expect(mock.texts()).toEqual(['Hola']);
  });

  it('un marco de capas se dibuja al instante y suma sus imágenes cuando terminan de cargar', async () => {
    const resolveImageUrl = vi.fn(async (path: string) => `https://cdn/${path}`);
    render(
      <FramePreview
        template="capas"
        params={{ layers: [{ type: 'image', src: SRC, full: true }, { type: 'text', text: 'Martina', font: 'sans' }] }}
        width={90}
        height={120}
        resolveImageUrl={resolveImageUrl}
      />,
    );

    expect(mock.texts()).toContain('Martina');
    expect(mock.count('drawImage')).toBe(0);

    await waitFor(() => expect(mock.count('drawImage')).toBeGreaterThan(0));
    expect(resolveImageUrl).toHaveBeenCalledWith(SRC);
  });

  it('sin resolveImageUrl no intenta cargar imágenes', async () => {
    render(<FramePreview template="capas" params={{ layers: [{ type: 'image', src: SRC, full: true }] }} width={90} height={120} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.count('drawImage')).toBe(0);
  });

  it('si la imagen no se puede cargar, el resto del marco queda dibujado', async () => {
    const resolveImageUrl = vi.fn(async () => {
      throw new Error('sin URL');
    });
    render(
      <FramePreview
        template="capas"
        params={{ layers: [{ type: 'image', src: SRC, full: true }, { type: 'text', text: 'Martina', font: 'sans' }] }}
        width={90}
        height={120}
        resolveImageUrl={resolveImageUrl}
      />,
    );
    await waitFor(() => expect(resolveImageUrl).toHaveBeenCalled());
    expect(mock.texts()).toContain('Martina');
    expect(mock.count('drawImage')).toBe(0);
  });

  it('con capture dibuja el fondo oscuro (#111), la muestra solo dentro de photoBox(capture) y la grilla; sin capture mantiene el dibujo completo', () => {
    const withoutCapture = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(withoutCapture.ctx);
    render(
      <FramePreview
        template="capas"
        params={{ layers: [{ type: 'image', src: SRC, full: true }] }}
        width={100}
        height={200}
      />,
    );
    const fillRectsWithout = withoutCapture.calls.filter((c) => c.name === 'fillRect').map((c) => c.args);
    expect(fillRectsWithout).toEqual([[0, 0, 100, 200]]);
    expect(withoutCapture.count('stroke')).toBe(0);

    const withCapture = createMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(withCapture.ctx);
    render(
      <FramePreview
        template="capas"
        params={{
          layers: [
            {
              type: 'image',
              src: SRC,
              full: true,
              capture: { x: 0.2, y: 0.3, w: 0.4, h: 0.5, scale: 1 },
            },
          ],
        }}
        width={100}
        height={200}
      />,
    );
    expect(withCapture.fills()).toContain('#111');
    const fillRectsWith = withCapture.calls.filter((c) => c.name === 'fillRect').map((c) => c.args);
    // Primero llena el lienzo entero (#111) y luego dibuja la foto de ejemplo dentro de photoBox (20, 60, 40, 100)
    expect(fillRectsWith).toEqual([
      [0, 0, 100, 200],
      [20, 60, 40, 100],
    ]);
    expect(withCapture.calls).toContainEqual({
      name: 'createLinearGradient',
      args: [20, 60, 60, 160],
    });
    expect(withCapture.count('stroke')).toBeGreaterThan(0);
  });
});
