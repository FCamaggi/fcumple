import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(__dirname, 'globals.css'), 'utf-8');

/** Cuerpo del primer bloque `@media (<query>) { … }`, con las llaves balanceadas. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media (${query})`);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return '';
}

describe('globals.css (móvil)', () => {
  // Safari en iPhone amplía la página al enfocar un campo de menos de 16 px y no la devuelve sola:
  // estropea el formulario de inscripción. Las utilidades `text-sm`/`text-xs` de los campos no deben ganarle.
  it('los campos de texto miden al menos 16 px en pantallas táctiles', () => {
    const block = mediaBlock('pointer: coarse');
    expect(block).toMatch(/input[^{]*,[\s\S]*textarea[^{]*,[\s\S]*select[^{]*\{[^}]*font-size:\s*(16px|1rem)/);
  });

  // Revisión móvil: las listas del panel tenían botones de 25–32 px (Aprobar, Quitar, Restablecer acceso…).
  // Red de seguridad para que ningún botón nuevo quede por debajo de los 44 px del dedo.
  it('los botones miden al menos 44 px de alto en pantallas táctiles, salvo los marcados data-compact', () => {
    const block = mediaBlock('pointer: coarse');
    expect(block).toMatch(/button:not\(\[data-compact\]\)[^{]*\{[^}]*min-height:\s*44px/);
  });

  it('esa regla no toca casillas, botones de opción, rangos ni archivos', () => {
    const block = mediaBlock('pointer: coarse');
    for (const type of ['checkbox', 'radio', 'range', 'file']) {
      expect(block).toContain(`:not([type='${type}'])`);
    }
  });
});
