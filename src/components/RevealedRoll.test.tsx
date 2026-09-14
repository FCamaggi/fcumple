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
// poder probar la carga perezosa del resto al expandir.
const bandPhotos = [
  { storagePath: 'tok1/a.jpg', createdAt: '2026-10-10T01:00:00Z' }, // 22:00
  { storagePath: 'tok2/b.jpg', createdAt: '2026-10-10T01:10:00Z' }, // 22:10
  { storagePath: 'tok3/c.jpg', createdAt: '2026-10-10T01:20:00Z' }, // 22:20
  { storagePath: 'tok4/d.jpg', createdAt: '2026-10-10T01:30:00Z' }, // 22:30
  { storagePath: 'tok5/e.jpg', createdAt: '2026-10-10T01:40:00Z' }, // 22:40
];

// Banda "23:00 — 00:00" (Chile) con 1 sola foto -- para probar que expandir
// una banda no dispara nada en otra.
const otherBandPhoto = { storagePath: 'tok6/f.jpg', createdAt: '2026-10-10T02:00:00Z' }; // 23:00

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
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok1/a.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok2/b.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok3/c.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok6/f.jpg');
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok4/d.jpg');
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok5/e.jpg');

    expect(screen.getByRole('button', { name: /22:00 — 23:00/ })).toBeInTheDocument();
    expect(screen.getByText('23:00 — 00:00')).toBeInTheDocument();
  });

  it('expands a band on click, resolving only the remaining photos (not the preview ones again)', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');
    vi.mocked(getSignedPhotoUrl).mockClear();

    const expandButton = screen.getByRole('button', { name: /ver las 5 fotos/i });
    await user.click(expandButton);

    await waitFor(() => {
      expect(getSignedPhotoUrl).toHaveBeenCalledTimes(2);
    });
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok4/d.jpg');
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok5/e.jpg');
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok1/a.jpg');

    await waitFor(() => {
      expect(screen.getAllByRole('presentation')).toHaveLength(6); // 5 de la banda expandida + 1 de la otra
    });
  });

  it('expanding a band does not fetch anything for the other bands', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[...bandPhotos, otherBandPhoto]} />);

    await screen.findAllByRole('presentation');
    vi.mocked(getSignedPhotoUrl).mockClear();

    await user.click(screen.getByRole('button', { name: /ver las 5 fotos/i }));

    await waitFor(() => {
      expect(getSignedPhotoUrl).toHaveBeenCalledTimes(2);
    });
    expect(getSignedPhotoUrl).not.toHaveBeenCalledWith('tok6/f.jpg');
  });

  it('a band with 3 or fewer photos has no expand button and shows a download button per photo right away', async () => {
    render(<RevealedRoll photos={[otherBandPhoto]} />);

    await screen.findAllByRole('presentation');

    expect(screen.queryByRole('button', { name: /ver las/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /descargar/i })).toHaveLength(1);
  });

  it('a download button only requests a signed download url once clicked, not before', async () => {
    const user = userEvent.setup();
    render(<RevealedRoll photos={[otherBandPhoto]} />);

    await screen.findAllByRole('presentation');
    expect(getSignedPhotoDownloadUrl).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /descargar/i }));

    await waitFor(() => {
      expect(getSignedPhotoDownloadUrl).toHaveBeenCalledWith('tok6/f.jpg');
    });
    expect(getSignedPhotoDownloadUrl).toHaveBeenCalledTimes(1);
  });
});
