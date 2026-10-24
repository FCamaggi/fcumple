import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre) ? [ruta] : [];
  });
}

describe('legibilidad en el teléfono', () => {
  // Revisión móvil: el texto de 10–11 px (etiquetas en Space Mono) no se lee al aire libre ni de noche.
  // Los tamaños salen de la escala de Tailwind (`text-xs` = 12 px o más), no de valores fijos.
  it('ningún componente fija texto de menos de 12 px', () => {
    const culpables = archivos(SRC).flatMap((ruta) => {
      const usos = readFileSync(ruta, 'utf-8').match(/text-\[(?:[0-9]|10|11)(?:\.\d+)?px\]/g);
      return usos ? [`${path.relative(SRC, ruta)}: ${[...new Set(usos)].join(', ')}`] : [];
    });
    expect(culpables).toEqual([]);
  });

  // La app habla de «tú» (Escribe, Inscríbete). El voseo ("Revisá", "probá") se coló en los avisos de error.
  it('los textos de la interfaz usan «tú» y no voseo', () => {
    // Solo las formas acentuadas del voseo: «Revisa» (tú) está bien, «Revisá» (vos) no.
    const voseo = /(?<![\p{L}])(?:revisá|probá|elegí|escribí|mirá|apretá|hacé|esperá|sacá|tenés|podés|querés)(?![\p{L}])/iu;
    const culpables = archivos(SRC).flatMap((ruta) =>
      readFileSync(ruta, 'utf-8')
        .split('\n')
        .flatMap((linea, i) => (/['"`>]/.test(linea) && voseo.test(linea) && !/^\s*(\/\/|\*|\/\*)/.test(linea) ? [`${path.relative(SRC, ruta)}:${i + 1}`] : [])),
    );
    expect(culpables).toEqual([]);
  });
});
