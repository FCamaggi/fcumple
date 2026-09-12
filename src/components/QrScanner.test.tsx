import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/adminApi', () => ({
  checkInGuest: vi.fn(),
}));

import QrScanner, { CheckInOverlay } from './QrScanner';
import type { Guest } from '../types';
import type { QrCheckInState } from '../hooks/useQrCheckIn';

const guest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'confirmed',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 1,
  guestNote: null,
  respondedAt: '2026-05-20T00:00:00Z',
  checkedInAt: '2026-05-20T23:15:00Z',
};

/**
 * What's covered here (per docs/BACKLOG.md Etapa 3): the pure "what to do
 * with a detected token" logic (src/hooks/useQrCheckIn.test.ts), the token
 * parsing (src/lib/qrToken.test.ts), and the presentational welcome
 * overlay/error overlay rendered from that state (below).
 *
 * NOT covered, and not realistically coverable in jsdom: actually opening a
 * device camera via getUserMedia, drawing a live video frame to canvas, and
 * jsQR decoding a real image buffer into a QR payload. jsdom has no camera
 * and no real `<video>`/`<canvas>` pixel pipeline. The one thing exercised
 * about QrScanner itself below is the fallback path when
 * `navigator.mediaDevices` doesn't exist (true by default in this jsdom
 * environment, same as a browser without camera support) -- it must not
 * crash or show a blank screen.
 */
describe('QrScanner', () => {
  it('shows a clear message instead of a blank screen when the camera API is unavailable', async () => {
    render(<QrScanner guests={[]} />);

    expect(await screen.findByText(/no permite acceder a la cámara/i)).toBeInTheDocument();
  });
});

describe('CheckInOverlay', () => {
  function successState(overrides: Partial<Extract<QrCheckInState, { phase: 'success' }>> = {}): Extract<
    QrCheckInState,
    { phase: 'success' }
  > {
    return { phase: 'success', guest, previousCheckedInAt: null, ...overrides };
  }

  it('shows the guest name and a first-arrival welcome when there is no previous check-in', () => {
    render(<CheckInOverlay state={successState()} reduceMotion={false} onReset={() => {}} />);

    expect(screen.getByText('Maria Fernanda Contreras')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText(/bienvenido/i)).toBeInTheDocument();
  });

  it('shows "ya había llegado" with the previous arrival time on a re-scan', () => {
    render(
      <CheckInOverlay
        state={successState({ previousCheckedInAt: '2026-05-20T22:00:00Z' })}
        reduceMotion={false}
        onReset={() => {}}
      />,
    );

    expect(screen.getByText(/ya había llegado/i)).toBeInTheDocument();
  });

  it('shows the declined-status accent without blocking the welcome', () => {
    render(
      <CheckInOverlay
        state={successState({ guest: { ...guest, status: 'declined' } })}
        reduceMotion={false}
        onReset={() => {}}
      />,
    );

    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText('Maria Fernanda Contreras')).toBeInTheDocument();
  });

  it('shows the pending-status accent', () => {
    render(
      <CheckInOverlay
        state={successState({ guest: { ...guest, status: 'pending' } })}
        reduceMotion={false}
        onReset={() => {}}
      />,
    );

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('calls onReset when "Escanear otro" is clicked', async () => {
    const onReset = vi.fn();
    render(<CheckInOverlay state={successState()} reduceMotion={false} onReset={onReset} />);

    await userEvent.click(screen.getByRole('button', { name: /escanear otro/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
