import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RsvpDeadlineStrip from './RsvpDeadlineStrip';

describe('RsvpDeadlineStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // docs/BACKLOG.md §5.2: con un deadline a varios días de distancia esto
  // mostraba un número de horas grande (ej. "432h") en vez de días+horas.
  it('shows days and hours when more than a day remains', () => {
    render(<RsvpDeadlineStrip deadline="2026-09-15T03:00:00Z" />);
    expect(screen.getByText(/quedan 2d 3h para confirmar/i)).toBeInTheDocument();
  });

  it('shows only hours when less than a day remains, same as before', () => {
    render(<RsvpDeadlineStrip deadline="2026-09-13T05:00:00Z" />);
    expect(screen.getByText(/quedan 5h para confirmar/i)).toBeInTheDocument();
    expect(screen.queryByText(/0d/i)).not.toBeInTheDocument();
  });

  it('still shows the urgency pulse under 48 hours', () => {
    render(<RsvpDeadlineStrip deadline="2026-09-14T12:00:00Z" />);
    const strip = screen.getByText(/última llamada/i).parentElement;
    expect(strip).toHaveClass('animate-pulse');
  });
});
