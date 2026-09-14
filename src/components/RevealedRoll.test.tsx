import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RevealedRoll from './RevealedRoll';

describe('RevealedRoll', () => {
  it('agrupa las fotos en bandas horarias con su label, cada foto como imagen', () => {
    render(
      <RevealedRoll
        photos={[
          { url: 'https://signed.example/a.jpg', createdAt: '2026-10-10T01:10:00Z' }, // 22:10 Chile
          { url: 'https://signed.example/b.jpg', createdAt: '2026-10-10T02:05:00Z' }, // 23:05 Chile
        ]}
      />,
    );

    const section = screen.getByLabelText('Rollo revelado');
    expect(section).toBeInTheDocument();
    expect(screen.getByText('22:00 — 23:00')).toBeInTheDocument();
    expect(screen.getByText('23:00 — 00:00')).toBeInTheDocument();

    const images = screen.getAllByRole('presentation');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://signed.example/a.jpg');
    expect(images[1]).toHaveAttribute('src', 'https://signed.example/b.jpg');
  });

  it('renders nothing when there are no revealed photos', () => {
    const { container } = render(<RevealedRoll photos={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
