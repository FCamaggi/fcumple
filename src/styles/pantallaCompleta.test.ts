import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..');
const css = readFileSync(path.join(__dirname, 'globals.css'), 'utf-8');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre) ? [ruta] : [];
  });
}

const leer = (rel: string) => readFileSync(path.join(SRC, rel), 'utf-8');

// Revisión móvil. En Safari de iPhone `100vh` es la altura con la barra del navegador escondida: una pantalla
// centrada queda más alta que la ventana visible y se desplaza. `dvh` sigue a la barra; el `vh` de antes queda de respaldo.
describe('pantalla completa en el teléfono', () => {
  it('define min-h-app con 100vh de respaldo y 100dvh', () => {
    expect(css).toMatch(/\.min-h-app\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh/);
  });

  it('ningún componente usa min-h-screen (100vh)', () => {
    const culpables = archivos(SRC).filter((r) => /\bmin-h-screen\b/.test(readFileSync(r, 'utf-8')));
    expect(culpables.map((r) => path.relative(SRC, r))).toEqual([]);
  });

  // Con `viewport-fit=cover` el contenido llega hasta el borde del teléfono: bajo el notch, a los lados en
  // horizontal y sobre la barra de inicio. `inset-safe` respeta esas zonas (vale 0 donde no hay).
  it('define inset-safe con las cuatro áreas seguras', () => {
    const bloque = /\.inset-safe\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const lado of ['top', 'right', 'bottom', 'left']) {
      expect(bloque).toContain(`env(safe-area-inset-${lado}`);
    }
  });

  it.each([
    'components/CameraCapture.tsx',
    'components/PhotoModerationPanel.tsx',
    'components/QrScanner.tsx',
    'components/PhotoLightbox.tsx',
    'components/DoorQrOverlay.tsx',
    'components/GuestHub.tsx',
  ])('%s: sus capas a pantalla completa respetan las áreas seguras', (rel) => {
    const fuente = leer(rel);
    expect(fuente).toContain('inset-safe');
    expect(fuente).not.toMatch(/fixed inset-0/);
  });
});
