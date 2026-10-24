import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PhoneFrame, { fitScale } from './PhoneFrame';

const SRC = '/panel/e/ev-1/vista-previa?estado=activa';

function frameWindow(): Window {
  const iframe = screen.getByTitle(/vista previa/i) as HTMLIFrameElement;
  return iframe.contentWindow as Window;
}

function fromFrame(data: unknown, overrides: { source?: Window | null; origin?: string } = {}) {
  act(() => {
    fireEvent(
      window,
      new MessageEvent('message', {
        data,
        origin: overrides.origin ?? window.location.origin,
        source: overrides.source === undefined ? frameWindow() : overrides.source,
      }),
    );
  });
}

describe('fitScale', () => {
  it('no agranda: con espacio de sobra queda a tamaño real', () => {
    expect(fitScale(500)).toBe(1);
    expect(fitScale(390)).toBe(1);
  });

  it('reduce para que el teléfono quepa en el ancho disponible', () => {
    expect(fitScale(312)).toBeCloseTo(0.8);
  });

  it('no baja de la mitad ni se rompe si el ancho es desconocido', () => {
    expect(fitScale(100)).toBe(0.5);
    expect(fitScale(0)).toBe(1);
  });
});

describe('PhoneFrame', () => {
  it('muestra la dirección en un iframe de teléfono (390×844) con un título que dice qué es', () => {
    render(<PhoneFrame src={SRC} label="Cámara activa" state="activa" />);

    const iframe = screen.getByTitle('Vista previa: Cámara activa') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('src', SRC);
    expect(iframe).toHaveStyle({ width: '390px', height: '844px' });
  });

  it('limita lo que el iframe puede hacer: no navega el panel ni abre ventanas', () => {
    render(<PhoneFrame src={SRC} label="x" state="activa" />);

    const sandbox = (screen.getByTitle(/vista previa/i) as HTMLIFrameElement).getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).toContain('allow-same-origin');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-popups');
  });

  it('manda el estado cuando el iframe avisa que está listo', () => {
    render(<PhoneFrame src={SRC} label="x" state="bloqueada" />);
    const post = vi.spyOn(frameWindow(), 'postMessage');

    fromFrame({ type: 'fcumple-preview-ready' });

    expect(post).toHaveBeenCalledWith(
      { type: 'fcumple-preview', state: 'bloqueada', draft: null },
      window.location.origin,
    );
  });

  it('vuelve a mandar cuando cambian el estado o el borrador, sin recargar el iframe', () => {
    const draft = { title: 'T', subtitle: null, body: 'B', coverImagePath: null, galleryPaths: [] };
    const { rerender } = render(<PhoneFrame src={SRC} label="x" state="activa" />);
    const iframe = screen.getByTitle(/vista previa/i);
    const post = vi.spyOn(frameWindow(), 'postMessage');

    rerender(<PhoneFrame src={SRC} label="x" state="aviso" draft={draft} />);

    expect(post).toHaveBeenLastCalledWith({ type: 'fcumple-preview', state: 'aviso', draft }, window.location.origin);
    expect(screen.getByTitle(/vista previa/i)).toBe(iframe);
  });

  it('no responde a un «listo» que no viene de su iframe', () => {
    render(<PhoneFrame src={SRC} label="x" state="activa" />);
    const post = vi.spyOn(frameWindow(), 'postMessage');

    fromFrame({ type: 'fcumple-preview-ready' }, { source: window });
    fromFrame({ type: 'fcumple-preview-ready' }, { origin: 'https://otro.example' });

    expect(post).not.toHaveBeenCalled();
  });

  it('entrega la nota que manda el iframe y descarta la de otros', () => {
    const onNote = vi.fn();
    render(<PhoneFrame src={SRC} label="x" state="fotos" onNote={onNote} />);

    fromFrame({ type: 'fcumple-preview-note', note: 'Las fotos son de ejemplo.' });
    fromFrame({ type: 'fcumple-preview-note', note: 'intrusa' }, { source: window });
    fromFrame({ type: 'fcumple-preview-note', note: 3 });

    expect(onNote).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledWith('Las fotos son de ejemplo.');
  });
});
