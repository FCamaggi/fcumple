import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevealedRoll from './RevealedRoll';

vi.mock('../lib/photosApi', () => ({
  getSignedPhotoUrl: vi.fn(),
  getSignedPhotoDownloadUrl: vi.fn(),
}));

import { getSignedPhotoUrl, getSignedPhotoDownloadUrl } from '../lib/photosApi';

// Banda "22:00 — 23:00" (Chile) con 5 fotos -- más que el preview de 3, para
// poder probar que el visor arranca con la banda completa sin volver a pedir
// las 3 primeras.
const bandPhotos = [
  { storagePath: 'tok1/a.jpg', displayStoragePath: 'tok1/a-display.jpg', createdAt: '2026-10-10T01:00:00Z' }, // 22:00
  { storagePath: 'tok2/b.jpg', displayStoragePath: null, createdAt: '2026-10-10T01:10:00Z' }, // 22:10
  { storagePath: 'tok3/c.jpg', displayStoragePath: 'tok3/c-display.jpg', createdAt: '2026-10-10T01:20:00Z' }, // 22:20
  { storagePath: 'tok4/d.jpg', displayStoragePath: null, createdAt: '2026-10-10T01:30:00Z' }, // 22:30
  { storagePath: 'tok5/e.jpg', displayStoragePath: null, createdAt: '2026-10-10T01:40:00Z' }, // 22:40
];

// Banda "23:00 — 00:00" (Chile) con 1 sola foto -- para probar que expandir
// una banda no dispara nada en otra.
const otherBandPhoto = { storagePath: 'tok6/f.jpg', displayStoragePath: null, createdAt: '2026-10-10T02:00:00Z' }; // 23:00

beforeEach(() => {
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockImplementation((path: string) => Promise.resolve(`https://signed.example/${path}`));
  vi.mocked(getSignedPhotoDownloadUrl).mockReset();
  vi.mocked(getSignedPhotoDownloadUrl).mockImplementation((path: string) =>
    Promise.resolve(`https://signed.example/${path}?download`),
  );
});

describe('RevealedRoll', () => {
  it('renders nothing when there are no revealed photos', () => {
    const { container } = render(<RevealedRoll photos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('resolves signed urls only for the first 3 photos of each band on mount', async () => {
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await waitFor(() => {
      const images = screen.getAllByRole('presentation');
      expect(images).toHaveLength(4); // 3 preview de la banda grande + 1 de la banda chica
    });

    expect(getSignedPhotoUrl).toHaveBeenCalledTimes(4);
    // Etapa 15: prefiere la copia "display" cuando la foto tiene una
    // (tok1, tok3); cae al original cuando no (tok2, tok6).
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok1/a-display.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok2/b.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok3/c-display.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok6/f.jpg');
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok4/d.jpg');
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok5/e.jpg');

    expect(screen.getByRole('button', { name: /ver las 5 fotos/i })).toBeInTheDocument();
    expect(screen.getByText('23:00 — 00:00')).toBeInTheDocument();
  });

  it('a band with 3 or fewer photos has no "ver las N fotos" button, just the band label', async () => {
    render(<RevealedRoll photos={[otherBandPhoto]} />);

    await screen.findAllByRole('presentation');

    expect(screen.queryByRole('button', { name: /ver las/i })).not.toBeInTheDocument();
    expect(screen.getByText('23:00 — 00:00')).toBeInTheDocument();
  });

  it('clicking "ver las N fotos" opens the lightbox starting at the first photo of the band', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');

    await user.click(screen.getByRole('button', { name: /ver las 5 fotos/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/foto 1 de 5/i);
  });

  it('clicking a preview thumbnail opens the lightbox starting at that photo', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');

    await user.click(screen.getByRole('button', { name: 'Ver foto 2 de la banda 22:00 — 23:00' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/foto 2 de 5/i);
  });

  it('closing the lightbox removes it from the document', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');
    await user.click(screen.getByRole('button', { name: /ver las 5 fotos/i }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Cerrar visor de fotos' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no longer shows a per-tile download button on the preview thumbnails', async () => {
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');

    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument();
  });
});
