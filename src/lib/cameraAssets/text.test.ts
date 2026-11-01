import { describe, expect, it, vi } from 'vitest';
import {
  CATALOG_FONTS,
  FONT_LABELS,
  FONT_STACKS,
  FRAME_FONTS,
  LAYER_FONTS,
  WEB_FONTS,
  fontOptionLabel,
  fontsOffered,
  loadFontFile,
  loadLayerFonts,
} from './text';

describe('catálogo corto de tipografías del Estudio', () => {
  it('son las cuatro elegidas sobre los diseños reales, tres formales y tres propias dibujadas por IA', () => {
    expect(CATALOG_FONTS).toEqual([
      'anton', 'pacifico', 'marker', 'elite', 'cinzel', 'vibes', 'cormorant',
      'gala-caligrafia', 'gala-romana', 'gala-deco',
    ]);
    for (const font of CATALOG_FONTS) expect((WEB_FONTS as readonly string[]).includes(font)).toBe(true);
  });

  it('el Estudio ofrece solo el catálogo, y la tipografía actual de la capa si es antigua', () => {
    expect(fontsOffered()).toEqual([...CATALOG_FONTS]);
    expect(fontsOffered('pacifico')).toEqual([...CATALOG_FONTS]);
    expect(fontsOffered('display')).toEqual([...CATALOG_FONTS, 'display']);
    expect(fontsOffered('playfair')).toEqual([...CATALOG_FONTS, 'playfair']);
    expect(fontsOffered('no-existe')).toEqual([...CATALOG_FONTS]);
  });

  it('las antiguas se rotulan «(antigua)» y las del catálogo no', () => {
    expect(fontOptionLabel('anton')).toBe(FONT_LABELS.anton);
    expect(fontOptionLabel('display')).toBe(`${FONT_LABELS.display} (antigua)`);
    expect(fontOptionLabel('playfair')).toBe(`${FONT_LABELS.playfair} (antigua)`);
  });

  it('las diecisiete son válidas y se dibujan: un marco guardado con una antigua no pierde su texto', () => {
    expect(LAYER_FONTS).toHaveLength(17);
    for (const font of LAYER_FONTS) expect(FONT_STACKS[font], font).toBeTruthy();
  });
});

describe('tipografías de las capas', () => {
  it('las plantillas conservan las seis del sistema; las capas suman las once web', () => {
    expect(FRAME_FONTS).toEqual(['sans', 'serif', 'mono', 'display', 'hand', 'typewriter']);
    expect(LAYER_FONTS).toEqual([...FRAME_FONTS, ...WEB_FONTS]);
    expect(WEB_FONTS).toEqual([
      'anton', 'playfair', 'pacifico', 'marker', 'elite', 'cinzel', 'vibes', 'cormorant',
      'gala-caligrafia', 'gala-romana', 'gala-deco',
    ]);
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
    expect(FONT_STACKS.cinzel).toMatch(/^"Cinzel"/);
    expect(FONT_STACKS.vibes).toMatch(/^"Great Vibes"/);
    expect(FONT_STACKS.cormorant).toMatch(/^"Cormorant Garamond"/);
    expect(FONT_STACKS['gala-caligrafia']).toMatch(/^"Gala Caligrafia"/);
    expect(FONT_STACKS['gala-romana']).toMatch(/^"Gala Romana"/);
    expect(FONT_STACKS['gala-deco']).toMatch(/^"Gala Deco"/);
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

describe('fuentes propias (archivos en /fonts)', () => {
  it('registran su familia desde /fonts/<id>.woff2 con FontFace y la agregan a document.fonts', async () => {
    const added: unknown[] = [];
    const load = vi.fn().mockResolvedValue(undefined);
    const FakeFace = vi.fn().mockImplementation((family: string, source: string) => ({ family, source, load }));
    await loadFontFile('Gala Romana', '/fonts/gala-romana.woff2', {
      createFace: (family, source) => new FakeFace(family, source),
      add: (face) => added.push(face),
    });
    expect(FakeFace).toHaveBeenCalledWith('Gala Romana', 'url(/fonts/gala-romana.woff2)');
    expect(load).toHaveBeenCalledTimes(1);
    expect(added).toHaveLength(1);
  });

  it('cargar una fuente propia pasa por el mismo cargador que las de @fontsource', async () => {
    const importCss = vi.fn().mockResolvedValue(undefined);
    const loadFace = vi.fn().mockResolvedValue([]);
    await loadLayerFonts(['gala-deco'], { importCss, loadFace });
    expect(importCss).toHaveBeenCalledWith('gala-deco');
    expect(loadFace).toHaveBeenCalledWith('400 16px "Gala Deco"');
  });
});
