import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WristbandCard from './WristbandCard';
import type { Guest, EventInfo } from '../types';

const guest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'pending',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 0,
  guestNote: null,
  respondedAt: null,
  checkedInAt: null,
};

const event: EventInfo = {
  name: 'NOCTURNA',
  tagline: '',
  date: 'sáb, 24 may',
  doorsTime: '22:00',
  rsvpDeadline: '2026-05-21T23:59:00Z',
  venueName: 'The Warehouse Club',
  venueAddress: '',
  dresscode: 'All black',
  lineup: '',
  capacityTotal: 0,
};

describe('WristbandCard', () => {
  // docs/BACKLOG.md §5.1: no hay ningún generador de QR real en el
  // proyecto -- el cuadrado "QR" era puramente decorativo y nunca
  // representó nada escaneable.
  it('does not show a fake "QR" square', () => {
    render(<WristbandCard guest={guest} event={event} />);
    expect(screen.queryByText('QR')).not.toBeInTheDocument();
  });

  it('does not ask for a physical ID document', () => {
    render(<WristbandCard guest={guest} event={event} />);
    expect(screen.queryByText(/dni/i)).not.toBeInTheDocument();
  });

  it('still renders the guest name and folio on the compact pass', () => {
    render(<WristbandCard guest={guest} event={event} compact />);
    expect(screen.getByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });
});
