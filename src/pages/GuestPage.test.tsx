import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GuestPage from './GuestPage';
import type { Guest } from '../types';

vi.mock('../lib/guestApi', () => ({
  getGuestByToken: vi.fn(),
  submitRsvp: vi.fn(),
}));

vi.mock('../lib/eventApi', () => ({
  getEventConfig: vi.fn(),
}));

vi.mock('../lib/postsApi', () => ({
  listPublishedPosts: vi.fn(),
}));

vi.mock('../lib/photosApi', () => ({
  getPhotoQuota: vi.fn(),
  listRevealedPhotos: vi.fn(),
  getSignedPhotoUrl: vi.fn(),
}));

import { getGuestByToken, submitRsvp } from '../lib/guestApi';
import { getEventConfig } from '../lib/eventApi';
import { listPublishedPosts } from '../lib/postsApi';
import { getPhotoQuota, listRevealedPhotos, getSignedPhotoUrl } from '../lib/photosApi';

const pendingGuest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'pending',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 0,
  guestNote: null,
  respondedAt: null,
};

const confirmedGuest: Guest = {
  ...pendingGuest,
  status: 'confirmed',
  plusOnesConfirmed: 1,
  guestNote: 'llego un poco tarde',
  respondedAt: '2026-05-01T00:00:00Z',
};

const declinedGuest: Guest = {
  ...pendingGuest,
  status: 'declined',
  plusOnesConfirmed: 0,
  guestNote: 'no puedo ir',
  respondedAt: '2026-05-01T00:00:00Z',
};

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/i/${token}`]}>
      <Routes>
        <Route path="/i/:token" element={<GuestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getGuestByToken).mockReset();
  vi.mocked(submitRsvp).mockReset();
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(getEventConfig).mockResolvedValue({
    eventName: 'NOCTURNA',
    eventDate: '2026-05-24T02:00:00Z',
    location: 'The Warehouse Club',
    theme: 'All black',
    rsvpDeadline: '2026-05-21T23:59:00Z',
    photosRevealedAt: null,
  });
  vi.mocked(listPublishedPosts).mockReset();
  vi.mocked(listPublishedPosts).mockResolvedValue([]);
  vi.mocked(getPhotoQuota).mockReset();
  vi.mocked(getPhotoQuota).mockResolvedValue({ quota: 5, used: 2 });
  vi.mocked(listRevealedPhotos).mockReset();
  vi.mocked(listRevealedPhotos).mockResolvedValue([]);
  vi.mocked(getSignedPhotoUrl).mockReset();
  vi.mocked(getSignedPhotoUrl).mockResolvedValue('https://signed.example/a.jpg');
});

describe('GuestPage', () => {
  it('shows a loading state while the guest is being fetched', () => {
    vi.mocked(getGuestByToken).mockReturnValue(new Promise(() => {}));

    renderAt('mafe-8842');

    expect(screen.getByText(/verificando invitación/i)).toBeInTheDocument();
  });

  it('renders the guest name once found', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });

  it('shows the invalid-token screen when no guest matches', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(null);

    renderAt('no-existe');

    expect(await screen.findByText(/no estás en lista/i)).toBeInTheDocument();
  });

  it('shows the invalid-token screen when the fetch fails', async () => {
    vi.mocked(getGuestByToken).mockRejectedValueOnce(new Error('network down'));

    renderAt('mafe-8842');

    expect(await screen.findByText(/no estás en lista/i)).toBeInTheDocument();
  });

  it('submits an rsvp and shows the confirmation screen', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...pendingGuest, status: 'confirmed', plusOnesConfirmed: 1 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'confirmed', 0, '');
  });

  it('degrades gracefully when the event is not configured yet', async () => {
    vi.mocked(getEventConfig).mockResolvedValueOnce(null);
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByText(/última llamada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rsvp cerrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it('shows an error toast and keeps the note when submit fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(submitRsvp).mockRejectedValueOnce(new Error('Este enlace de invitación ya no es válido.'));
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    await user.type(screen.getByLabelText(/mensaje a puerta/i), 'hola puerta');
    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/enlace de invitación ya no es válido/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/mensaje a puerta/i)).toHaveValue('hola puerta'));
  });

  it('lets a confirmed guest edit their rsvp, prefilled with their current answer', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    const user = userEvent.setup();

    renderAt('mafe-8842');

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    expect(await screen.findByRole('button', { name: 'Voy', pressed: true })).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje a puerta/i)).toHaveValue('llego un poco tarde');
  });

  it('submits a changed answer from edit mode and lands on the fresh terminal screen', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...confirmedGuest, status: 'declined', plusOnesConfirmed: 0 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    await user.click(await screen.findByRole('button', { name: 'No voy' }));
    await user.click(screen.getByRole('button', { name: /liberar cupo/i }));

    expect(await screen.findByText(/cupo liberado/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'declined', 1, 'llego un poco tarde');
    expect(screen.queryByRole('button', { name: /confirmar asistencia/i })).not.toBeInTheDocument();
  });

  it('lets a declined guest edit their rsvp and switch to confirmed', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(declinedGuest);
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...declinedGuest, status: 'confirmed', plusOnesConfirmed: 0 });
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/cupo liberado/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    expect(await screen.findByRole('button', { name: 'No voy', pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voy' }));
    await user.click(screen.getByRole('button', { name: /confirmar asistencia/i }));

    expect(await screen.findByText(/access granted/i)).toBeInTheDocument();
    expect(submitRsvp).toHaveBeenCalledWith('mafe-8842', 'confirmed', 0, 'no puedo ir');
  });

  it('stays in edit mode with the error toast when a resubmit from edit mode fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(confirmedGuest);
    vi.mocked(submitRsvp).mockRejectedValueOnce(new Error('Este enlace de invitación ya no es válido.'));
    const user = userEvent.setup();

    renderAt('mafe-8842');
    await screen.findByText(/access granted/i);
    await user.click(screen.getByRole('button', { name: /editar mi respuesta/i }));

    await user.click(await screen.findByRole('button', { name: 'No voy' }));
    await user.click(screen.getByRole('button', { name: /liberar cupo/i }));

    expect(await screen.findByText(/enlace de invitación ya no es válido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No voy', pressed: true })).toBeInTheDocument();
    expect(screen.queryByText(/cupo liberado/i)).not.toBeInTheDocument();
  });

  it('shows the announcement ticker when there are published posts', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(listPublishedPosts).mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Ya salió la lista',
        body: 'Revisen el link, quedan pocos cupos.',
        publishedAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-04-28T00:00:00Z',
      },
    ]);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect((await screen.findAllByText(/ya salió la lista/i)).length).toBeGreaterThan(0);
  });

  it('does not break the page when the announcements fetch fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(listPublishedPosts).mockRejectedValueOnce(new Error('network down'));

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });

  it('shows the camera section with the remaining shots once the quota loads', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(getPhotoQuota).mockResolvedValueOnce({ quota: 5, used: 4 });

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect(await screen.findByLabelText('Cámara')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('does not break the page when the photo quota fetch fails', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(getPhotoQuota).mockRejectedValueOnce(new Error('network down'));

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Cámara')).not.toBeInTheDocument();
  });

  it('does not show the revealed roll before the admin reveals it', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);

    renderAt('mafe-8842');
    await screen.findByText(/maria fernanda contreras/i);

    expect(listRevealedPhotos).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Rollo revelado')).not.toBeInTheDocument();
  });

  it('shows the revealed roll once photosRevealedAt is set and photos come back', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(getEventConfig).mockReset();
    vi.mocked(getEventConfig).mockResolvedValue({
      eventName: 'NOCTURNA',
      eventDate: '2026-05-24T02:00:00Z',
      location: 'The Warehouse Club',
      theme: 'All black',
      rsvpDeadline: '2026-05-21T23:59:00Z',
      photosRevealedAt: '2026-06-01T00:00:00Z',
    });
    vi.mocked(listRevealedPhotos).mockResolvedValueOnce([
      { id: 'tok1/a.jpg', guestId: '', storagePath: 'tok1/a.jpg', status: 'approved', createdAt: '' },
    ]);

    renderAt('mafe-8842');

    expect(await screen.findByLabelText('Rollo revelado')).toBeInTheDocument();
    expect(getSignedPhotoUrl).toHaveBeenCalledWith('tok1/a.jpg');
  });

  it('does not break the page when the revealed-roll fetch fails (e.g. the RPC is not deployed yet)', async () => {
    vi.mocked(getGuestByToken).mockResolvedValueOnce(pendingGuest);
    vi.mocked(getEventConfig).mockReset();
    vi.mocked(getEventConfig).mockResolvedValue({
      eventName: 'NOCTURNA',
      eventDate: '2026-05-24T02:00:00Z',
      location: 'The Warehouse Club',
      theme: 'All black',
      rsvpDeadline: '2026-05-21T23:59:00Z',
      photosRevealedAt: '2026-06-01T00:00:00Z',
    });
    vi.mocked(listRevealedPhotos).mockRejectedValueOnce(
      new Error('No pudimos cargar el rollo revelado: function list_revealed_photos() does not exist'),
    );

    renderAt('mafe-8842');

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Rollo revelado')).not.toBeInTheDocument();
  });
});
