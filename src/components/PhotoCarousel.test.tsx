import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/photosApi', () => ({
  getSignedPhotoUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));
vi.mock('./PhotoLightbox', () => ({
  default: ({ photos, startIndex, onClose }: { photos: unknown[]; startIndex: number; onClose: () => void }) => (
    <div role="dialog" aria-label="visor">
      visor {startIndex + 1} de {photos.length}
      <button onClick={onClose}>cerrar visor</button>
    </div>
  ),
}));

import { getSignedPhotoUrl } from '../lib/photosApi';
import PhotoCarousel from './PhotoCarousel';
import type { RawRevealedPhoto } from './RevealedRoll';

const photo = (n: number): RawRevealedPhoto => ({
  storagePath: `ev/g/${n}.jpg`,
  displayStoragePath: `ev/g/${n}-display.jpg`,
  createdAt: `2026-10-30T${String(20 + (n % 4)).padStart(2, '0')}:${String(n).padStart(2, '0')}:00Z`,
});

beforeEach(() => {
  vi.mocked(getSignedPhotoUrl).mockClear();
});

describe('PhotoCarousel', () => {
  it('no muestra nada si todavía no hay fotos publicadas', () => {
    const { container } = render(<PhotoCarousel photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra como máximo las 10 últimas fotos, las más nuevas primero', () => {
    const photos = Array.from({ length: 14 }, (_, i) => photo(i + 1));
    render(<PhotoCarousel photos={photos} />);
    const slides = screen.getAllByRole('button', { name: /^Ver foto/ });
    expect(slides).toHaveLength(10);
    expect(screen.getByText(/10 de 14 fotos/)).toBeInTheDocument();
  });

  it('carga la copia liviana (display) y no el original', async () => {
    render(<PhotoCarousel photos={[photo(1)]} />);
    await waitFor(() => expect(getSignedPhotoUrl).toHaveBeenCalledWith('ev/g/1-display.jpg'));
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('ev/g/1.jpg');
    expect(await screen.findByAltText('Foto 1 de la fiesta')).toHaveAttribute('src', 'https://signed.example/ev/g/1-display.jpg');
  });

  it('si la foto no tiene copia liviana usa el original', async () => {
    render(<PhotoCarousel photos={[{ ...photo(2), displayStoragePath: null }]} />);
    await waitFor(() => expect(getSignedPhotoUrl).toHaveBeenCalledWith('ev/g/2.jpg'));
  });

  it('tocar una foto abre el visor en esa foto', async () => {
    render(<PhotoCarousel photos={[photo(1), photo(2), photo(3)]} />);
    await userEvent.click(screen.getAllByRole('button', { name: /^Ver foto/ })[1]);
    expect(screen.getByRole('dialog', { name: 'visor' })).toHaveTextContent('visor 2 de 3');
    await userEvent.click(screen.getByRole('button', { name: 'cerrar visor' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('es un carrusel con desplazamiento por teclado y con nombre', () => {
    render(<PhotoCarousel photos={[photo(1), photo(2)]} />);
    const list = screen.getByRole('list', { name: 'Carrusel de fotos' });
    expect(list).toHaveAttribute('tabindex', '0');
  });

  it('si una URL falla, el resto sigue cargando', async () => {
    vi.mocked(getSignedPhotoUrl).mockRejectedValueOnce(new Error('boom'));
    render(<PhotoCarousel photos={[photo(1), photo(2)]} />);
    expect(await screen.findAllByRole('img')).toHaveLength(1);
  });
});
