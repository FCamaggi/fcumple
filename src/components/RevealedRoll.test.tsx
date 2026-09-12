import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RevealedRoll from './RevealedRoll';

describe('RevealedRoll', () => {
  it('renders every photo url as an image inside the labelled section', () => {
    render(<RevealedRoll photoUrls={['https://signed.example/a.jpg', 'https://signed.example/b.jpg']} />);

    const section = screen.getByLabelText('Rollo revelado');
    expect(section).toBeInTheDocument();
    const images = screen.getAllByRole('presentation');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://signed.example/a.jpg');
    expect(images[1]).toHaveAttribute('src', 'https://signed.example/b.jpg');
  });

  it('renders nothing when there are no revealed photos', () => {
    const { container } = render(<RevealedRoll photoUrls={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
