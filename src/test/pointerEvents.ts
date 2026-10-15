/**
 * jsdom no implementa PointerEvent. Este mínimo (un MouseEvent con pointerId)
 * permite que fireEvent.pointerDown/Move/Up lleven coordenadas a React.
 */
export function installPointerEventPolyfill() {
  if ('PointerEvent' in window) return;
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

/** Hace que todo elemento mida `width` × `height` (jsdom devuelve 0). */
export function mockElementSize(width: number, height: number) {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
  return () => {
    if (w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', w);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    if (h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', h);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}
