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

/**
 * Pantalla de cámara del invitado, PR 1: el visor manda y los controles quedan al alcance del pulgar. El contador
 * pasa compacto a la cabecera; «Cerrar», «Cambiar cámara» y las flechas de marco van abajo, junto al obturador.
 */
describe('CameraCapture: controles al alcance del pulgar', () => {
  async function open() {
    render(<CameraCapture token="tok" quota={{ quota: 5, used: 1 }} onClose={() => {}} />);
    await screen.findByText(/no permite acceder a la cámara/i);
    return screen.getByRole('group', { name: 'Controles de la cámara' });
  }

  it('«Cerrar» y «Cambiar cámara» están en los controles de abajo, no arriba', async () => {
    const controles = await open();
    expect(controles).toContainElement(screen.getByRole('button', { name: 'Cerrar' }));
    expect(controles).toContainElement(screen.getByRole('button', { name: 'Cambiar cámara' }));
  });

  it('las flechas de marco están en la misma fila que el obturador', async () => {
    await open();
    const fila = screen.getByRole('button', { name: /disparar/i }).parentElement as HTMLElement;
    expect(fila).toContainElement(screen.getByRole('button', { name: 'Marco anterior' }));
    expect(fila).toContainElement(screen.getByRole('button', { name: 'Siguiente marco' }));
    expect(fila).toContainElement(screen.getByRole('button', { name: 'Cerrar' }));
    expect(fila).toContainElement(screen.getByRole('button', { name: 'Cambiar cámara' }));
  });

  it('el contador compacto vive en la cabecera, no entre los controles', async () => {
    const controles = await open();
    const cabecera = screen.getByRole('group', { name: 'Estado de la cámara' });
    const contador = screen.getByRole('img', { name: /disparos restantes/i });
    expect(cabecera).toContainElement(contador);
    expect(controles).not.toContainElement(contador);
    expect(screen.queryByText(/rollo \/\/ disparos/i)).not.toBeInTheDocument();
  });

  it('la etiqueta del marco es un chip dentro de los controles', async () => {
    const controles = await open();
    expect(controles).toContainElement(screen.getByText('Marco // Sin marco'));
  });

  it('el rótulo «Cámara // modo carrete» ya no ocupa la cabecera de la cámara activa', async () => {
    await open();
    expect(screen.queryByText(/cámara \/\/ modo carrete/i)).not.toBeInTheDocument();
  });
});
