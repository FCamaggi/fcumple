import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventHeader from './EventHeader';

describe('EventHeader', () => {
  it('muestra el evento, el subtítulo, el saludo con el primer nombre, la fecha y el lugar', () => {
    render(
      <EventHeader
        event={{
          name: 'NOCHE DE DISFRACES',
          subtitle: 'Cumpleaños Martina',
          startsAt: '2026-10-30T23:00:00Z',
          location: 'Casa de Martina',
        }}
        guestName="Ana María Pérez"
      />,
    );

    expect(screen.getByText('NOCHE DE DISFRACES')).toBeInTheDocument();
    expect(screen.getByText('Cumpleaños Martina')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Ana');
    expect(screen.getByText(/octubre/i)).toBeInTheDocument();
    expect(screen.getByText('Casa de Martina')).toBeInTheDocument();
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
