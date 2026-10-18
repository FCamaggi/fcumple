import { describe, expect, it, vi } from 'vitest';
import { FONT_LABELS, FONT_STACKS, FRAME_FONTS, LAYER_FONTS, WEB_FONTS, loadLayerFonts } from './text';

describe('tipografías de las capas', () => {
  it('las plantillas conservan las seis del sistema; las capas suman las cinco de Francisca', () => {
    expect(FRAME_FONTS).toEqual(['sans', 'serif', 'mono', 'display', 'hand', 'typewriter']);
    expect(LAYER_FONTS).toEqual([...FRAME_FONTS, ...WEB_FONTS]);
    expect(WEB_FONTS).toEqual(['anton', 'playfair', 'pacifico', 'marker', 'elite']);
  });

  it('cada tipografía tiene etiqueta y una pila que termina en una genérica', () => {
    for (const font of LAYER_FONTS) {
      expect(FONT_LABELS[font], font).toBeTruthy();
      expect(FONT_STACKS[font], font).toMatch(/(sans-serif|serif|monospace|cursive)$/);
    }
  });

  it('las web nombran su familia primero, para que el canvas use la descargada', () => {
    expect(FONT_STACKS.anton).toMatch(/^"Anton"/);
    expect(FONT_STACKS.playfair).toMatch(/^"Playfair Display"/);
    expect(FONT_STACKS.pacifico).toMatch(/^"Pacifico"/);
    expect(FONT_STACKS.marker).toMatch(/^"Permanent Marker"/);
    expect(FONT_STACKS.elite).toMatch(/^"Special Elite"/);
  });
});

describe('loadLayerFonts', () => {
  it('importa el CSS y espera cada peso solo de las tipografías web pedidas, sin repetir', async () => {
    const importCss = vi.fn().mockResolvedValue(undefined);
    const loadFace = vi.fn().mockResolvedValue([]);

    await loadLayerFonts(['playfair', 'anton', 'playfair'], { importCss, loadFace });

    expect(importCss.mock.calls.map((c) => c[0]).sort()).toEqual(['anton', 'playfair']);
    expect(loadFace.mock.calls.map((c) => c[0]).sort()).toEqual([
      '400 16px "Anton"',
      '400 16px "Playfair Display"',
      '700 16px "Playfair Display"',
    ]);
  });

  it('ignora las de sistema y las desconocidas', async () => {
    const importCss = vi.fn().mockResolvedValue(undefined);
    const loadFace = vi.fn().mockResolvedValue([]);
    await loadLayerFonts(['sans', 'display', 'comic-sans'], { importCss, loadFace });
    expect(importCss).not.toHaveBeenCalled();
    expect(loadFace).not.toHaveBeenCalled();
  });

  it('si una falla no rechaza ni impide cargar las otras', async () => {
    const importCss = vi.fn((font: string) => (font === 'anton' ? Promise.reject(new Error('offline')) : Promise.resolve()));
    const loadFace = vi.fn().mockResolvedValue([]);
    await expect(loadLayerFonts(['anton', 'pacifico'], { importCss, loadFace })).resolves.toBeUndefined();
    expect(loadFace.mock.calls.map((c) => c[0])).toEqual(['400 16px "Pacifico"']);
  });
});
