import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Guest } from '../types';

vi.mock('../lib/guestApi', () => ({
  submitRsvp: vi.fn(),
}));

vi.mock('../lib/devApi', () => ({
  devCheckIn: vi.fn(),
  devResetGuest: vi.fn(),
}));

// qrcode dibuja sobre un <canvas> real -- jsdom no tiene pipeline de
// canvas, así que se mockea igual que jsQR/getUserMedia en QrScanner.test.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake') },
}));

import DevPanel from './DevPanel';
import { submitRsvp } from '../lib/guestApi';
import { devCheckIn, devResetGuest } from '../lib/devApi';

const guest: Guest = {
  id: 'dev1',
  token: 'dev-preview',
  fullName: 'Invitado DEV',
  status: 'pending',
  plusOnesAllowed: 10,
  plusOnesConfirmed: 0,
  guestNote: null,
  respondedAt: null,
  checkedInAt: null,
};

function renderPanel(onGuestChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <DevPanel guest={guest} token="dev-preview" onGuestChange={onGuestChange} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(submitRsvp).mockReset();
  vi.mocked(devCheckIn).mockReset();
  vi.mocked(devResetGuest).mockReset();
});

describe('DevPanel', () => {
  it('makes it unmistakable that this is not part of the guest experience', () => {
    renderPanel();
    expect(screen.getByText(/panel dev/i)).toBeInTheDocument();
    expect(screen.getByText(/no es parte de la experiencia de invitado/i)).toBeInTheDocument();
  });

  it('confirms rsvp with the guest\'s full plusOnesAllowed when "Ver: confirmado" is used', async () => {
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...guest, status: 'confirmed', plusOnesConfirmed: 10 });
    const onGuestChange = vi.fn();
    const user = userEvent.setup();
    renderPanel(onGuestChange);

    await user.click(screen.getByRole('button', { name: /ver: confirmado/i }));

    expect(submitRsvp).toHaveBeenCalledWith('dev-preview', 'confirmed', 10, 'preview dev');
    await waitFor(() => expect(onGuestChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' })));
  });

  it('declines rsvp with 0 plus ones when "Ver: no voy" is used', async () => {
    vi.mocked(submitRsvp).mockResolvedValueOnce({ ...guest, status: 'declined', plusOnesConfirmed: 0 });
    const onGuestChange = vi.fn();
    const user = userEvent.setup();
    renderPanel(onGuestChange);

    await user.click(screen.getByRole('button', { name: /ver: no voy/i }));

    expect(submitRsvp).toHaveBeenCalledWith('dev-preview', 'declined', 0);
    await waitFor(() => expect(onGuestChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' })));
  });

  it('resets the guest via dev_reset_guest', async () => {
    vi.mocked(devResetGuest).mockResolvedValueOnce({ ...guest, status: 'pending', checkedInAt: null });
    const onGuestChange = vi.fn();
    const user = userEvent.setup();
    renderPanel(onGuestChange);

    await user.click(screen.getByRole('button', { name: /reiniciar/i }));

    expect(devResetGuest).toHaveBeenCalledWith('dev-preview');
    await waitFor(() => expect(onGuestChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
  });

  it('simulates a door check-in via check_in_guest', async () => {
    vi.mocked(devCheckIn).mockResolvedValueOnce({ ...guest, checkedInAt: '2026-05-20T23:00:00Z' });
    const onGuestChange = vi.fn();
    const user = userEvent.setup();
    renderPanel(onGuestChange);

    await user.click(screen.getByRole('button', { name: /simular check-in/i }));

    expect(devCheckIn).toHaveBeenCalledWith('dev-preview');
    await waitFor(() =>
      expect(onGuestChange).toHaveBeenCalledWith(expect.objectContaining({ checkedInAt: '2026-05-20T23:00:00Z' })),
    );
  });

  it('links to an invalid token to preview the error screen', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /token inválido/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/i\/.+/));
    expect(link.getAttribute('href')).not.toBe('/i/dev-preview');
  });

  it('renders a real scannable QR encoding the guest\'s own link', async () => {
    renderPanel();
    const img = await screen.findByRole('img', { name: /qr/i });
    expect(img).toHaveAttribute('src', expect.stringContaining('data:image/png'));
  });
});
