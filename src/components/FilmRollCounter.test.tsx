import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import FilmRollCounter from './FilmRollCounter';

describe('FilmRollCounter', () => {
  it('shows the remaining shots (quota - used), not the used count', () => {
    render(<FilmRollCounter quota={5} used={2} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('never shows a negative count when used somehow exceeds quota', () => {
    render(<FilmRollCounter quota={5} used={9} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows 0 remaining when the roll is used up', () => {
    render(<FilmRollCounter quota={5} used={5} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders a mechanical-dial style counter, not a plain "N/M" label', () => {
    render(<FilmRollCounter quota={5} used={2} />);
    // The spec explicitly rules out a flat "3/5" text node -- the count and
    // the quota must not be rendered together as one literal string.
    expect(screen.queryByText('3/5')).not.toBeInTheDocument();
    expect(screen.queryByText('3 / 5')).not.toBeInTheDocument();
  });

  it('exposes the remaining count to assistive tech via an accessible label', () => {
    render(<FilmRollCounter quota={5} used={2} />);
    expect(screen.getByLabelText(/3.*disparos restantes/i)).toBeInTheDocument();
  });
});
