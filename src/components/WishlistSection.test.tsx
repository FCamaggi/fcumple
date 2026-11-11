import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import WishlistSection from './WishlistSection';
import type { WishlistConfig } from '../lib/wishlist';

const mockWishlist: WishlistConfig = {
  enabled: true,
  title: 'Regalos para Martina',
  displayMode: 'chip',
  honorees: [],
  items: [
    {
      id: 'item-1',
      url: 'https://paris.cl/instax',
      title: 'Cámara Instax Mini',
      imageUrl: 'https://paris.cl/img.jpg',
      price: '$79.990',
      notes: 'Color lila',
      honoreeIds: [],
    },
  ],
};

describe('WishlistSection', () => {
  it('no renderiza nada si está deshabilitada o vacía', () => {
    const { container: c1 } = render(<WishlistSection wishlist={undefined} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<WishlistSection wishlist={{ enabled: false, displayMode: 'chip', honorees: [], items: [] }} />);
    expect(c2).toBeEmptyDOMElement();

    const { container: c3 } = render(<WishlistSection wishlist={{ enabled: true, displayMode: 'chip', honorees: [], items: [] }} />);
    expect(c3).toBeEmptyDOMElement();
  });

  it('renderiza el chip compacto con el título y contador en modo chip', () => {
    render(<WishlistSection wishlist={mockWishlist} />);

    expect(screen.getByText('Regalos para Martina')).toBeInTheDocument();
    expect(screen.getByText(/1 ítem →/i)).toBeInTheDocument();
  });

  it('renderiza la tarjeta en modo card', () => {
    render(<WishlistSection wishlist={{ ...mockWishlist, displayMode: 'card' }} />);

    expect(screen.getByText(/🎁 Regalos para Martina/i)).toBeInTheDocument();
    expect(screen.getByText(/Ver regalos sugeridos →/i)).toBeInTheDocument();
  });

  it('al hacer clic abre el modal accesible con los regalos y enlaces', async () => {
    const user = userEvent.setup();
    render(<WishlistSection wishlist={mockWishlist} />);

    const chipButton = screen.getByRole('button', { name: /Regalos para Martina/i });
    await user.click(chipButton);

    const dialog = screen.getByRole('dialog', { name: 'Regalos para Martina' });
    expect(dialog).toBeInTheDocument();

    expect(screen.getByText('Cámara Instax Mini')).toBeInTheDocument();
    expect(screen.getByText('$79.990')).toBeInTheDocument();
    expect(screen.getByText('Color lila')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Ver Cámara Instax Mini/i });
    expect(link).toHaveAttribute('href', 'https://paris.cl/instax');
    expect(link).toHaveAttribute('target', '_blank');

    // Cerrar el modal
    const closeBtn = screen.getByRole('button', { name: /Cerrar lista de regalos/i });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('con varios festejados', () => {
    const item = (id: string, title: string, honoreeIds: string[]) => ({
      id,
      url: `https://x.cl/${id}`,
      title,
      honoreeIds,
    });
    const triple: WishlistConfig = {
      enabled: true,
      title: 'Regalos',
      displayMode: 'card',
      honorees: [
        { id: 'h1', name: 'Nacho' },
        { id: 'h2', name: 'Grazia' },
        { id: 'h3', name: 'Cata' },
      ],
      items: [
        item('a', 'Patineta', ['h1']),
        item('b', 'Pinturas', ['h2', 'h3']),
        item('c', 'Juego de mesa', []),
      ],
    };

    it('la tarjeta dice para quiénes son los regalos', () => {
      render(<WishlistSection wishlist={triple} />);
      expect(screen.getByText('Regalos para Nacho, Grazia y Cata.')).toBeInTheDocument();
    });

    it('el modal separa los regalos por festejado', async () => {
      const user = userEvent.setup();
      render(<WishlistSection wishlist={triple} />);
      await user.click(screen.getByRole('button', { name: /Ver regalos sugeridos/i }));

      const headings = within(screen.getByRole('dialog')).getAllByRole('heading', { level: 3 });
      expect(headings.map((h) => h.textContent)).toEqual(['Para Nacho', 'Para Grazia y Cata', 'Para todos']);
      expect(within(screen.getByRole('region', { name: 'Para Nacho' })).getByText('Patineta')).toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Para Grazia y Cata' })).getByText('Pinturas')).toBeInTheDocument();
      expect(within(screen.getByRole('region', { name: 'Para todos' })).getByText('Juego de mesa')).toBeInTheDocument();
    });

    it('sin festejados la lista no lleva títulos por persona', async () => {
      const user = userEvent.setup();
      render(<WishlistSection wishlist={mockWishlist} />);
      await user.click(screen.getByRole('button', { name: /Regalos para Martina/i }));
      expect(within(screen.getByRole('dialog')).queryByRole('region')).not.toBeInTheDocument();
    });
  });
});
