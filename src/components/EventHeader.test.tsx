import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventHeader from './EventHeader';

describe('EventHeader', () => {
  it('muestra el evento, el subtítulo, el saludo con el primer nombre, la fecha y el lugar', () => {
    render(
      <EventHeader
        event={{
          name: 'PUTI HALLOWEEN',
          subtitle: 'Cumpleaños Fran',
          startsAt: '2026-10-30T23:00:00Z',
          location: 'Casa de Fran',
        }}
        guestName="Ana María Pérez"
      />,
    );

    expect(screen.getByText('PUTI HALLOWEEN')).toBeInTheDocument();
    expect(screen.getByText('Cumpleaños Fran')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Ana');
    expect(screen.getByText(/octubre/i)).toBeInTheDocument();
    expect(screen.getByText('Casa de Fran')).toBeInTheDocument();
  });

  it('omite el subtítulo, la fecha y el lugar cuando el evento no los tiene', () => {
    render(
      <EventHeader event={{ name: 'Carrete', subtitle: null, startsAt: null, location: null }} guestName="Luis Soto" />,
    );

    expect(screen.getByText('Carrete')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Luis');
    expect(screen.queryByText(/octubre/i)).not.toBeInTheDocument();
  });
});
