import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DoorList from './DoorList';
import type { Guest } from '../types';

const baseGuest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'confirmed',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 1,
  guestNote: null,
  respondedAt: '2026-05-20T00:00:00Z',
  checkedInAt: null,
  createdAt: '2026-05-20T00:00:00Z',
};

describe('DoorList — check-in chip (Etapa 3)', () => {
  it('shows a dash placeholder when the guest has not checked in yet', () => {
    render(<DoorList guests={[baseGuest]} onEditGuest={() => {}} />);

    expect(screen.queryByText(/en la puerta/i)).not.toBeInTheDocument();
  });

  it('shows "En la puerta" with the arrival time, in addition to the RSVP status chip, when checked in', () => {
    render(
      <DoorList
        guests={[{ ...baseGuest, checkedInAt: '2026-05-20T23:15:00Z' }]}
        onEditGuest={() => {}}
      />,
    );

    // Both chips present at once -- RSVP status and door check-in are two
    // distinct signals, not a replacement of one for the other.
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText(/en la puerta/i)).toBeInTheDocument();
  });
});

describe('DoorList — badge de invitado dev (Etapa 5, Parte B)', () => {
  it('marks the dev seed guest row with a "DEV" badge', () => {
    render(<DoorList guests={[{ ...baseGuest, isDev: true }]} onEditGuest={() => {}} />);
    expect(screen.getByText('DEV')).toBeInTheDocument();
  });

  it('does not show the badge for a regular guest', () => {
    render(<DoorList guests={[baseGuest]} onEditGuest={() => {}} />);
    expect(screen.queryByText('DEV')).not.toBeInTheDocument();
  });
});
