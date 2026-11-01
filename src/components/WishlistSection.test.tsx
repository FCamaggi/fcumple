import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import WishlistSection from './WishlistSection';
import type { WishlistConfig } from '../lib/wishlist';

const mockWishlist: WishlistConfig = {
  enabled: true,
  title: 'Regalos para Martina',
  displayMode: 'chip',
  items: [
    {
      id: 'item-1',
      url: 'https://paris.cl/instax',
      title: 'Cámara Instax Mini',
      imageUrl: 'https://paris.cl/img.jpg',
      price: '$79.990',
      notes: 'Color lila',
    },
  ],
};

describe('WishlistSection', () => {
  it('no renderiza nada si está deshabilitada o vacía', () => {
    const { container: c1 } = render(<WishlistSection wishlist={undefined} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<WishlistSection wishlist={{ enabled: false, displayMode: 'chip', items: [] }} />);
    expect(c2).toBeEmptyDOMElement();

    const { container: c3 } = render(<WishlistSection wishlist={{ enabled: true, displayMode: 'chip', items: [] }} />);
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
});
