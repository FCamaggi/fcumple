import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// docs/BACKLOG.md §5.3: el bug era que el knob se montaba en el extremo
// izquierdo (x=0) y solo llegaba al centro vía un `animate()` async dentro
// de un `useEffect` -- si el usuario arrastraba antes de que esa animación
// terminara, `handleDragEnd` leía un `x` todavía cerca de 0 y lo redondeaba
// a "no". Se espía `animate` de framer-motion para verificar la causa raíz
// directamente: en el primer montaje la posición correcta debe fijarse de
// forma sincrónica (sin pasar por `animate`), así no hay ninguna ventana
// async en la que un drag/tap inmediato pueda leer una posición vieja.
const animateSpy = vi.fn();
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, animate: (...args: Parameters<typeof actual.animate>) => {
    animateSpy(...args);
    return actual.animate(...args);
  } };
});

const { default: FaderToggle } = await import('./FaderToggle');

describe('FaderToggle', () => {
  it('marks the button matching the current value as pressed', () => {
    render(<FaderToggle value="neutral" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sin decidir' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'No voy' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Voy' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with "yes" when the accessible "Voy" tap target is used', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FaderToggle value="neutral" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Voy' }));

    expect(onChange).toHaveBeenCalledWith('yes');
  });

  it('calls onChange with "no" when the accessible "No voy" tap target is used', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FaderToggle value="yes" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'No voy' }));

    expect(onChange).toHaveBeenCalledWith('no');
  });

  it('sets the initial knob position synchronously on mount instead of animating into place', () => {
    animateSpy.mockClear();

    render(<FaderToggle value="neutral" onChange={() => {}} />);

    // No `animate()` call means there is no async window during which a
    // drag/tap could read a stale, not-yet-settled position.
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('still animates the knob when the committed value changes after mount', () => {
    animateSpy.mockClear();
    const { rerender } = render(<FaderToggle value="neutral" onChange={() => {}} />);
    expect(animateSpy).not.toHaveBeenCalled();

    rerender(<FaderToggle value="yes" onChange={() => {}} />);

    expect(animateSpy).toHaveBeenCalledTimes(1);
  });
});
