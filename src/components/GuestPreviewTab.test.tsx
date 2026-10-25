import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestPreviewTab from './GuestPreviewTab';
import type { OrganizerEvent } from '../lib/organizerApi';

const SECRET = 'SECRETO-DEL-QR-1234';
const event = { id: 'ev-1', slug: 'puti-halloween', name: 'PUTI HALLOWEEN', activationCode: SECRET } as unknown as OrganizerEvent;

function iframe() {
  return screen.getByTitle(/vista previa/i) as HTMLIFrameElement;
}

describe('GuestPreviewTab', () => {
  it('ofrece los siete estados de lo que ve el invitado, con «Cámara activa» elegido al empezar', () => {
    render(<GuestPreviewTab event={event} />);

    for (const name of [
      'Inscripción',
      'Cámara bloqueada',
      'Cámara activa',
      'Avisos',
      'Fotos publicadas',
      'Cartelera vacía',
      'Cupo agotado',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Cámara activa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Avisos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('abre la vista previa de este evento sin llevar el código de activación', () => {
    render(<GuestPreviewTab event={event} />);

    const src = iframe().getAttribute('src') ?? '';
    expect(src).toBe('/panel/e/ev-1/vista-previa?estado=activa');
    expect(src).not.toContain(SECRET);
  });

  it('cambiar de estado se lo manda al mismo iframe, sin recargarlo', async () => {
    render(<GuestPreviewTab event={event} />);
    const frame = iframe();
    const post = vi.spyOn(frame.contentWindow as Window, 'postMessage');

    await userEvent.click(screen.getByRole('button', { name: 'Fotos publicadas' }));

    expect(iframe()).toBe(frame);
    expect(frame.getAttribute('src')).toBe('/panel/e/ev-1/vista-previa?estado=activa');
    expect(post).toHaveBeenLastCalledWith({ type: 'fcumple-preview', state: 'fotos', draft: null, themeId: null }, window.location.origin);
    expect(screen.getByRole('button', { name: 'Fotos publicadas' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cámara activa' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('muestra la nota que manda la vista previa y la quita cuando no hay', () => {
    render(<GuestPreviewTab event={event} />);
    const source = iframe().contentWindow as Window;
    const note = (text: string | null) =>
      act(() => {
        fireEvent(
          window,
          new MessageEvent('message', {
            data: { type: 'fcumple-preview-note', note: text },
            origin: window.location.origin,
            source,
          }),
        );
      });

    note('Las fotos son de ejemplo: aquí irán las que publiques.');
    expect(screen.getByRole('status')).toHaveTextContent('Las fotos son de ejemplo');

    // La región viva sigue en pantalla, vacía: así un lector de pantalla anuncia la nota siguiente.
    note(null);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('explica que la cámara usa tu cámara de verdad sin guardar nada y que la gente es de ejemplo', () => {
    render(<GuestPreviewTab event={event} />);

    expect(screen.getByText(/la cámara usa tu cámara de verdad y no guarda nada/i)).toBeInTheDocument();
  });
});
