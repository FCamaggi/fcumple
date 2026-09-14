import { createElement } from 'react';
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
//
// Bug distinto, encontrado después de un QA real en celular (ver más abajo):
// se espía también `motion.div` para poder inspeccionar el prop
// `dragConstraints` que efectivamente recibe el knob -- no es observable
// desde el DOM (framer-motion lo usa internamente para clampear el gesto de
// drag, no lo refleja en ningún atributo), así que hace falta interceptarlo
// en el punto donde React se lo pasa al componente real.
const animateSpy = vi.fn();
const motionDivPropsSpy = vi.fn();
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  const RealMotionDiv = actual.motion.div;
  return {
    ...actual,
    animate: (...args: Parameters<typeof actual.animate>) => {
      animateSpy(...args);
      return actual.animate(...args);
    },
    motion: {
      ...actual.motion,
      div: (props: Record<string, unknown>) => {
        motionDivPropsSpy(props);
        return createElement(RealMotionDiv, props);
      },
    },
  };
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

  // Bug real reportado por el usuario tras probar en un celular: "al
  // interactuar con el fader siempre se va a la izquierda". No era una
  // regresión del fix de arriba (§5.3, la posición inicial ya se fija bien) --
  // la causa real es distinta: `dragConstraints={{ left: 0, right: travel() }}`
  // se evaluaba durante el render, ANTES de que `trackRef` tuviera el DOM
  // montado (los refs recién se adjuntan en el commit, después del render).
  // Como nada volvía a renderizar el componente entre el montaje y la
  // primera interacción del usuario, ese límite de arrastre quedaba fijo en
  // `{left: 0, right: 0}` para siempre -- el knob podía *verse* centrado
  // (la posición inicial sí lee el ref ya montado, dentro del
  // `useLayoutEffect`), pero cualquier drag lo clampeaba a x=0 (izquierda)
  // porque ese era el único valor que el límite permitía.
  //
  // El gesto de drag en sí no es simulable de forma confiable en jsdom (sin
  // layout real), así que este test no lo intenta -- en cambio, inspecciona
  // directamente el prop `dragConstraints` que el knob recibe una vez
  // asentado (interceptando `motion.div`, ver el mock de arriba). Con el
  // bug, ese prop queda `{ left: 0, right: 0 }` para siempre. El fix lo hace
  // depender de un ancho medido en estado de React (actualizado vía
  // `useLayoutEffect`, antes del primer paint), así que el valor asentado
  // refleja el ancho real del track.
  it('settles the drag boundary on the real measured track width, not the pre-mount reading of zero', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
    motionDivPropsSpy.mockClear();
    try {
      render(<FaderToggle value="yes" onChange={() => {}} />);

      const lastProps = motionDivPropsSpy.mock.calls.at(-1)?.[0] as { dragConstraints: { left: number; right: number } };
      // width 300 - KNOB_WIDTH 56 - TRACK_PADDING*2 8 = 236px de recorrido real.
      expect(lastProps.dragConstraints).toEqual({ left: 0, right: 236 });
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original);
    }
  });
});
