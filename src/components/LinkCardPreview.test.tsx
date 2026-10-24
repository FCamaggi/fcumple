import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LinkCardPreview from './LinkCardPreview';
import { NEUTRAL } from '../../api/event-meta';

const event = {
  name: 'Cumpleaños Fran',
  slug: 'cumpleanos-fran-j4h7',
  subtitle: 'Noche de Halloween',
  // 20:30 en Santiago (UTC-3 en octubre).
  startsAt: '2026-10-30T23:30:00Z',
  location: 'Los Pozos 6855',
};

describe('LinkCardPreview', () => {
  it('muestra el título y la descripción que verá WhatsApp, con el dominio del enlace', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    const card = screen.getByRole('group', { name: /así se verá el enlace en whatsapp/i });
    expect(card).toHaveTextContent('Cumpleaños Fran');
    expect(card).toHaveTextContent(/Noche de Halloween · viernes,? 30 de octubre · 20:30 · Los Pozos 6855/);
    expect(card).toHaveTextContent('Inscríbete con tu nombre y toma fotos de la fiesta.');
    expect(card).toHaveTextContent('fcumple-ten.vercel.app');
  });

  it('sin datos extra usa la misma descripción neutra que la tarjeta real', () => {
    render(
      <LinkCardPreview
        event={{ name: 'Fiesta', slug: 'fiesta-abcd', subtitle: null, startsAt: null, location: null }}
        origin="https://fcumple-ten.vercel.app"
      />,
    );
    expect(screen.getByText(NEUTRAL.description)).toBeInTheDocument();
  });

  it('usa la imagen propia del evento (public/og/<slug>.jpg) si existe', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    expect(screen.getByRole('img', { name: /imagen de la tarjeta/i })).toHaveAttribute(
      'src',
      '/og/cumpleanos-fran-j4h7.jpg',
    );
    expect(screen.queryByText(/sin imagen propia/i)).not.toBeInTheDocument();
  });

  it('si la imagen no existe, la tarjeta sale solo con texto y lo dice', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    fireEvent.error(screen.getByRole('img', { name: /imagen de la tarjeta/i }));
    expect(screen.queryByRole('img', { name: /imagen de la tarjeta/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sin imagen propia/i)).toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveTextContent('Cumpleaños Fran');
  });

  it('avisa que WhatsApp guarda la tarjeta un rato, para no creer que está rota', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    expect(screen.getByText(/whatsapp puede tardar en actualizarla/i)).toBeInTheDocument();
  });

  it('un evento nuevo con otra imagen vuelve a intentarla (no arrastra el fallo del anterior)', () => {
    const { rerender } = render(<LinkCardPreview event={event} origin="https://x.app" />);
    fireEvent.error(screen.getByRole('img', { name: /imagen de la tarjeta/i }));
    rerender(<LinkCardPreview event={{ ...event, slug: 'otro-evento-zz9' }} origin="https://x.app" />);
    expect(screen.getByRole('img', { name: /imagen de la tarjeta/i })).toHaveAttribute('src', '/og/otro-evento-zz9.jpg');
  });
});
