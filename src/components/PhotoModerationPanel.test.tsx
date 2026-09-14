import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/photosApi', () => ({
  listAllPhotosForModeration: vi.fn(),
  moderatePhoto: vi.fn(),
  getSignedPhotoUrl: vi.fn(),
}));

vi.mock('../lib/eventApi', () => ({
  revealPhotos: vi.fn(),
}));

import { listAllPhotosForModeration, moderatePhoto, getSignedPhotoUrl } from '../lib/photosApi';
import { revealPhotos } from '../lib/eventApi';
import PhotoModerationPanel from './PhotoModerationPanel';

const older = {
  id: 'p1',
  guestId: 'g1',
  storagePath: 'tok1/a.jpg',
  status: 'pending' as const,
  createdAt: '2026-06-01T09:00:00Z',
  guestFullName: 'Juana Pérez',
};

const newer = {
  ...older,
  id: 'p2',
  storagePath: 'tok1/b.jpg',
  createdAt: '2026-06-01T10:00:00Z',
  guestFullName: 'Pedro Soto',
};

const approvedPhoto = { ...older, id: 'p3', status: 'approved' as const };

beforeEach(() => {
  vi.mocked(listAllPhotosForModeration).mockReset();
  vi.mocked(moderatePhoto).mockReset();
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockResolvedValue('https://signed.example/a.jpg');
  vi.mocked(revealPhotos).mockReset();
});

/**
 * PhotoModerationPanel es ahora un overlay a pantalla completa (Etapa 9,
 * Frente 2 del backlog), triage de a una foto tipo carrete. Lo que sí es
 * testable en jsdom, mismo criterio que CameraCapture.test.tsx/
 * QrScanner.test.tsx: el orden de la cola, el contador, el avance
 * automático tras aprobar/rechazar vía los botones (siempre visibles), el
 * mensaje de estado vacío, y el `confirm()` de "Revelar el rollo" con/sin
 * cola pendiente. El gesto de swipe real de framer-motion no es testable
 * acá (igual que el pan de marcos en CameraCapture) -- su lógica pura vive
 * en lib/photoModerationQueue.ts y se prueba ahí.
 */
describe('PhotoModerationPanel', () => {
  it('shows only pending photos, oldest first, with a position counter and the guest name', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([newer, older, approvedPhoto]);

    render(<PhotoModerationPanel onClose={vi.fn()} />);

    expect(await screen.findByText('Juana Pérez')).toBeInTheDocument();
    expect(screen.getByText(/fotos.*1 de 2/i)).toBeInTheDocument();
  });

  it('shows a message when there is nothing pending to moderate', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([approvedPhoto]);

    render(<PhotoModerationPanel onClose={vi.fn()} />);

    expect(await screen.findByText(/no hay fotos pendientes/i)).toBeInTheDocument();
  });

  it('approves the current photo and advances to the next one automatically', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older, newer]);
    vi.mocked(moderatePhoto).mockResolvedValueOnce({ ...older, status: 'approved' });
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /aprobar/i }));

    expect(moderatePhoto).toHaveBeenCalledWith('p1', 'approved');
    expect(await screen.findByText('Pedro Soto')).toBeInTheDocument();
    expect(screen.getByText(/fotos.*1 de 1/i)).toBeInTheDocument();
  });

  it('rejects the current photo and advances to the next one automatically', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older, newer]);
    vi.mocked(moderatePhoto).mockResolvedValueOnce({ ...older, status: 'rejected' });
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /rechazar/i }));

    expect(moderatePhoto).toHaveBeenCalledWith('p1', 'rejected');
    expect(await screen.findByText('Pedro Soto')).toBeInTheDocument();
  });

  it('shows the empty state after the last photo in the queue is decided', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older]);
    vi.mocked(moderatePhoto).mockResolvedValueOnce({ ...older, status: 'approved' });
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /aprobar/i }));

    expect(await screen.findByText(/no hay fotos pendientes/i)).toBeInTheDocument();
  });

  it('shows an error message when loading the queue fails', async () => {
    vi.mocked(listAllPhotosForModeration).mockRejectedValueOnce(new Error('permission denied'));

    render(<PhotoModerationPanel onClose={vi.fn()} />);

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
  });

  it('disables the decision buttons while a moderation call is in flight, so a fast double-tap only sends it once', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older]);
    let resolveModerate!: (value: Awaited<ReturnType<typeof moderatePhoto>>) => void;
    vi.mocked(moderatePhoto).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveModerate = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    const approveButton = screen.getByRole('button', { name: /aprobar/i });
    await user.click(approveButton);
    // Un segundo click mientras la primera llamada sigue en vuelo no debe
    // disparar una segunda -- el botón ya está deshabilitado en ese momento.
    await user.click(approveButton);
    expect(approveButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeDisabled();
    expect(moderatePhoto).toHaveBeenCalledTimes(1);

    resolveModerate({ ...older, status: 'approved' });
    await waitFor(() => expect(screen.getByText(/no hay fotos pendientes/i)).toBeInTheDocument());
  });

  it('shows an error and keeps the photo in place when moderating fails', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older]);
    vi.mocked(moderatePhoto).mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /aprobar/i }));

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    expect(screen.getByText('Juana Pérez')).toBeInTheDocument();
  });

  it('reveals the roll after confirmation, with no pending-queue warning when the queue is empty', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([approvedPhoto]);
    vi.mocked(revealPhotos).mockResolvedValueOnce({
      eventName: null,
      eventDate: null,
      location: null,
      theme: null,
      rsvpDeadline: null,
      photosRevealedAt: '2026-06-01T00:00:00Z',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText(/no hay fotos pendientes/i);

    await user.click(screen.getByRole('button', { name: /revelar el rollo/i }));

    expect(confirmSpy.mock.calls[0][0]).not.toMatch(/quedan/i);
    expect(revealPhotos).toHaveBeenCalled();
    expect(await screen.findByText(/rollo revelado/i)).toBeInTheDocument();
  });

  it('warns about the remaining pending photos when revealing with a non-empty queue', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([older, newer]);
    vi.mocked(revealPhotos).mockResolvedValueOnce({
      eventName: null,
      eventDate: null,
      location: null,
      theme: null,
      rsvpDeadline: null,
      photosRevealedAt: '2026-06-01T00:00:00Z',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /revelar el rollo/i }));

    expect(confirmSpy.mock.calls[0][0]).toMatch(/quedan 2 fotos sin moderar/i);
    expect(revealPhotos).toHaveBeenCalled();
  });

  it('does not reveal the roll when the confirmation is dismissed', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={vi.fn()} />);
    await screen.findByText(/no hay fotos pendientes/i);

    await user.click(screen.getByRole('button', { name: /revelar el rollo/i }));

    expect(revealPhotos).not.toHaveBeenCalled();
  });

  it('calls onClose when the header close button is pressed', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([]);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<PhotoModerationPanel onClose={onClose} />);
    await screen.findByText(/no hay fotos pendientes/i);

    await user.click(screen.getByRole('button', { name: /cerrar/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
