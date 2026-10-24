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

  // Capas que cubren la pantalla en cualquier orden de clases (`fixed inset-0`, `inset-0 fixed`, `fixed z-50 inset-0`…).
  // Los cuatro diálogos de la lista son cuadros centrados con margen (organizador / Fase 0): no necesitan el área segura.
  const DIALOGOS_CENTRADOS = [
    'pages/AdminPage.tsx',
    'components/CreateGuestModal.tsx',
    'components/GuestEditModal.tsx',
    'components/ImportGuestsModal.tsx',
  ];

  it('ninguna capa a pantalla completa usa inset-0: todas respetan las áreas seguras (salvo los diálogos centrados)', () => {
    const culpables = archivos(SRC)
      .map((r) => path.relative(SRC, r))
      .filter((rel) => !DIALOGOS_CENTRADOS.includes(rel))
      .filter((rel) =>
        leer(rel)
          .split('\n')
          .some((linea) => /\bfixed\b/.test(linea) && /\binset-0\b/.test(linea)),
      );
    expect(culpables).toEqual([]);
  });

  it.each([
    'components/CameraCapture.tsx',
    'components/PhotoModerationPanel.tsx',
    'components/QrScanner.tsx',
    'components/PhotoLightbox.tsx',
    'components/DoorQrOverlay.tsx',
    'components/GuestHub.tsx',
  ])('%s: sus capas a pantalla completa usan inset-safe', (rel) => {
    expect(leer(rel)).toContain('inset-safe');
  });
});
