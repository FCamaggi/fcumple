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
    render(<FramePreview template="banner" params={{ title: 'Hola' }} width={90} height={120} />);
    expect(mock.texts()).toEqual(['Hola']);
  });

  it('un marco de capas se dibuja al instante y suma sus imágenes cuando terminan de cargar', async () => {
    const resolveImageUrl = vi.fn(async (path: string) => `https://cdn/${path}`);
    render(
      <FramePreview
        template="capas"
        params={{ layers: [{ type: 'image', src: SRC, full: true }, { type: 'text', text: 'Fran', font: 'sans' }] }}
        width={90}
        height={120}
        resolveImageUrl={resolveImageUrl}
      />,
    );

    expect(mock.texts()).toContain('Fran');
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
        params={{ layers: [{ type: 'image', src: SRC, full: true }, { type: 'text', text: 'Fran', font: 'sans' }] }}
        width={90}
        height={120}
        resolveImageUrl={resolveImageUrl}
      />,
    );
    await waitFor(() => expect(resolveImageUrl).toHaveBeenCalled());
    expect(mock.texts()).toContain('Fran');
    expect(mock.count('drawImage')).toBe(0);
  });
});
