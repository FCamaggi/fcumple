import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CameraCapture from './CameraCapture';

vi.mock('../lib/photosApi', () => ({ uploadPhoto: vi.fn() }));

/**
 * Revisión móvil: con el teléfono en horizontal (unos 360 px de alto) el contador, los stickers y el obturador
 * ocupaban casi toda la altura y el visor quedaba en un recuadro de ~40 px. En horizontal bajo la cámara pasa a
 * dos columnas: el visor a la izquierda y los controles en una columna a la derecha.
 */
describe('CameraCapture: horizontal', () => {
  it('la configuración de Tailwind define la variante short (horizontal y bajo)', () => {
    const config = readFileSync(path.join(__dirname, '..', '..', 'tailwind.config.js'), 'utf-8');
    expect(config).toMatch(/short:\s*\{\s*raw:\s*'\(orientation: landscape\) and \(max-height: \d+px\)'/);
  });

  it('agrupa los controles en una región con nombre', async () => {
    render(<CameraCapture token="tok" quota={{ quota: 5, used: 1 }} onClose={() => {}} />);
    await screen.findByText(/no permite acceder a la cámara/i);

    const controles = screen.getByRole('group', { name: 'Controles de la cámara' });
    expect(controles).toContainElement(screen.getByRole('button', { name: 'Siguiente marco' }));
  });

  it('en horizontal bajo pone el visor y los controles lado a lado', async () => {
    render(<CameraCapture token="tok" quota={{ quota: 5, used: 1 }} onClose={() => {}} />);
    await screen.findByText(/no permite acceder a la cámara/i);

    const controles = screen.getByRole('group', { name: 'Controles de la cámara' });
    expect(controles.parentElement?.className).toContain('short:flex-row');
    expect(controles.className).toContain('short:w-60');
    expect(controles.className).toContain('short:shrink-0');
    // Si aun así no caben, la columna se desplaza en vez de apretar el visor.
    expect(controles.className).toContain('short:overflow-y-auto');
  });
});
