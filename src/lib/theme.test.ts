import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  contrastRatio,
  hexToChannels,
  resolveTheme,
  themeCssVars,
  type ThemeColors,
} from './theme';

const mix = (fg: string, bg: string, alpha: number) => {
  const f = [1, 3, 5].map((i) => parseInt(fg.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
};

describe('presets: contraste (WCAG AA)', () => {
  it.each(THEME_PRESETS.map((p) => [p.id, p.colors] as [string, ThemeColors]))('%s', (_id, c) => {
    // Texto principal y atenuado (la UI usa text/70 y text/50 en etiquetas de 10-11 px).
    expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mix(c.text, c.surface, 0.5), c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mix(c.text, c.bg, 0.5), c.bg)).toBeGreaterThanOrEqual(4.5);
    // El botón principal lleva el color de fondo como texto: tiene que leerse sobre el acento.
    expect(contrastRatio(c.bg, c.accent)).toBeGreaterThanOrEqual(4.5);
    // El énfasis se usa como texto y como fondo de botón con texto oscuro (ink-950 = fondo).
    expect(contrastRatio(c.bg, c.emphasis)).toBeGreaterThanOrEqual(4.5);
    // Acento, etiqueta, énfasis y error como texto sobre fondo y superficie.
    for (const key of ['accent', 'label', 'emphasis', 'error'] as const) {
      expect(contrastRatio(c[key], c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[key], c.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('todos los presets son oscuros (la app no tiene modo claro)', () => {
    for (const p of THEME_PRESETS) expect(contrastRatio(p.colors.bg, '#000000')).toBeLessThan(1.5);
  });

  it('los ids son únicos y cumplen el formato que valida la base', () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]{0,29}$/);
  });
});

describe('resolveTheme', () => {
  it('sin tema, o con uno que no existe, usa el neón de siempre', () => {
    expect(resolveTheme(undefined).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme({}).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme(null).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme({ preset: 'no-existe' }).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme({ preset: 5 }).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme('rosa-chicle').id).toBe(DEFAULT_THEME_ID);
  });

  it('entiende un preset válido', () => {
    expect(resolveTheme({ preset: 'rosa-chicle' }).id).toBe('rosa-chicle');
  });

  it('«Rosa chicle y negro» es el de Francisca: rosa chicle sobre negro, con letras oscuras en el botón', () => {
    const { colors } = resolveTheme({ preset: 'rosa-chicle' });
    expect(colors.accent).toBe('#ff5fa2');
    expect(colors.bg).toBe('#150a12');
    expect(contrastRatio('#ffffff', colors.accent)).toBeLessThan(4.5); // texto blanco sobre ese rosa NO sirve
  });
});

describe('variables CSS', () => {
  it('convierte un hex a canales "r g b" (para rgb(var(--x) / alpha))', () => {
    expect(hexToChannels('#ff5fa2')).toBe('255 95 162');
    expect(hexToChannels('#0d0b12')).toBe('13 11 18');
  });

  it('genera una variable por cada rol', () => {
    const vars = themeCssVars(resolveTheme({ preset: 'rosa-chicle' }).colors);
    expect(vars).toEqual({
      '--c-ink-950': '21 10 18',
      '--c-ink-900': '34 15 27',
      '--c-smoke-700': '90 42 69',
      '--c-paper-100': '255 240 246',
      '--c-acid-400': '255 95 162',
      '--c-laser-500': '255 179 212',
      '--c-hotpink-500': '255 143 192',
      '--c-flame-500': '255 122 69',
    });
  });

  it('los valores por defecto de globals.css son exactamente los del tema neón (cero cambio visual sin tema)', () => {
    const css = readFileSync(path.join(__dirname, '..', 'styles', 'globals.css'), 'utf-8');
    const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
    const neon = themeCssVars(THEME_PRESETS.find((p) => p.id === DEFAULT_THEME_ID)!.colors);
    for (const [name, value] of Object.entries(neon)) {
      expect(root).toContain(`${name}: ${value};`);
    }
  });
});
