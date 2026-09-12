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

import { getGuestByToken, submitRsvp } from '../lib/guestApi';

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
});
