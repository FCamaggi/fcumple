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

const pendingPhoto = {
  id: 'p1',
  guestId: 'g1',
  storagePath: 'tok1/a.jpg',
  status: 'pending' as const,
  createdAt: '2026-06-01T00:00:00Z',
  guestFullName: 'Juana Pérez',
};

const approvedPhoto = { ...pendingPhoto, id: 'p2', status: 'approved' as const };

beforeEach(() => {
  vi.mocked(listAllPhotosForModeration).mockReset();
  vi.mocked(moderatePhoto).mockReset();
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockResolvedValue('https://signed.example/a.jpg');
  vi.mocked(revealPhotos).mockReset();
});

describe('PhotoModerationPanel', () => {
  it('shows only the pending photos in the moderation queue, with the guest name', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([pendingPhoto, approvedPhoto]);

    render(<PhotoModerationPanel />);

    expect(await screen.findByText('Juana Pérez')).toBeInTheDocument();
    // approvedPhoto also belongs to Juana Pérez, so assert on the count of
    // moderation rows instead of a second name match.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows a message when there is nothing pending to moderate', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([approvedPhoto]);

    render(<PhotoModerationPanel />);

    expect(await screen.findByText(/no hay fotos pendientes/i)).toBeInTheDocument();
  });

  it('approves a photo and removes it from the pending queue', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([pendingPhoto]);
    vi.mocked(moderatePhoto).mockResolvedValueOnce({ ...pendingPhoto, status: 'approved' });
    const user = userEvent.setup();

    render(<PhotoModerationPanel />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /aprobar/i }));

    expect(moderatePhoto).toHaveBeenCalledWith('p1', 'approved');
    await waitFor(() => expect(screen.queryByText('Juana Pérez')).not.toBeInTheDocument());
  });

  it('rejects a photo and removes it from the pending queue', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([pendingPhoto]);
    vi.mocked(moderatePhoto).mockResolvedValueOnce({ ...pendingPhoto, status: 'rejected' });
    const user = userEvent.setup();

    render(<PhotoModerationPanel />);
    await screen.findByText('Juana Pérez');

    await user.click(screen.getByRole('button', { name: /rechazar/i }));

    expect(moderatePhoto).toHaveBeenCalledWith('p1', 'rejected');
    await waitFor(() => expect(screen.queryByText('Juana Pérez')).not.toBeInTheDocument());
  });

  it('shows an error message when loading the queue fails', async () => {
    vi.mocked(listAllPhotosForModeration).mockRejectedValueOnce(new Error('permission denied'));

    render(<PhotoModerationPanel />);

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
  });

  it('reveals the roll after confirmation', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([]);
    vi.mocked(revealPhotos).mockResolvedValueOnce({
      eventName: null,
      eventDate: null,
      location: null,
      theme: null,
      rsvpDeadline: null,
      photosRevealedAt: '2026-06-01T00:00:00Z',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<PhotoModerationPanel />);
    await screen.findByText(/no hay fotos pendientes/i);

    await user.click(screen.getByRole('button', { name: /revelar el rollo/i }));

    expect(revealPhotos).toHaveBeenCalled();
    expect(await screen.findByText(/rollo revelado/i)).toBeInTheDocument();
  });

  it('does not reveal the roll when the confirmation is dismissed', async () => {
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    render(<PhotoModerationPanel />);
    await screen.findByText(/no hay fotos pendientes/i);

    await user.click(screen.getByRole('button', { name: /revelar el rollo/i }));

    expect(revealPhotos).not.toHaveBeenCalled();
  });
});
