import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LinkCardPreview from './LinkCardPreview';
import { NEUTRAL } from '../../api/event-meta';

const event = {
  name: 'Cumpleaños Martina',
  slug: 'cumpleanos-martina-a1b2',
  subtitle: 'Noche de Halloween',
  // 20:30 en Santiago (UTC-3 en octubre).
  startsAt: '2026-10-30T23:30:00Z',
  location: 'Calle Falsa 123',
};

describe('LinkCardPreview', () => {
  it('muestra el título y la descripción que verá WhatsApp, con el dominio del enlace', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    const card = screen.getByRole('group', { name: /así se verá el enlace en whatsapp/i });
    expect(card).toHaveTextContent('Cumpleaños Martina');
    expect(card).toHaveTextContent(/Noche de Halloween · viernes,? 30 de octubre · 20:30 · Calle Falsa 123/);
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
      '/og/cumpleanos-martina-a1b2.jpg',
    );
    expect(screen.queryByText(/sin imagen propia/i)).not.toBeInTheDocument();
  });

  it('si la imagen no existe, la tarjeta sale solo con texto y lo dice', () => {
    render(<LinkCardPreview event={event} origin="https://fcumple-ten.vercel.app" />);
    fireEvent.error(screen.getByRole('img', { name: /imagen de la tarjeta/i }));
    expect(screen.queryByRole('img', { name: /imagen de la tarjeta/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sin imagen propia/i)).toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveTextContent('Cumpleaños Martina');
  });

  it('recorta los espacios del título, igual que la tarjeta real', () => {
    render(<LinkCardPreview event={{ ...event, name: '  Cumpleaños Martina  ' }} origin="https://x.app" />);
    // `getByText` ya ignora los espacios de los bordes, así que se compara el texto exacto.
    expect(screen.getByText('Cumpleaños Martina', { selector: 'p' }).textContent).toBe('Cumpleaños Martina');
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
