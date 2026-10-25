import { vi } from 'vitest';

/**
 * Contexto 2D simulado que registra cada llamada, con un measureText
 * determinista (0,5 × tamaño de fuente por carácter). jsdom no trae canvas.
 */
export function createMockCtx() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const state: Record<string, unknown> = { font: '10px sans-serif' };

  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };

  const gradients: Array<{ stops: Array<[number, string]> }> = [];

  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop === 'measureText') {
        return (text: string) => {
          const size = parseFloat(String(target.font).match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '10');
          return { width: text.length * size * 0.5 };
        };
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ name: prop, args });
          const gradient = { stops: [] as Array<[number, string]>, addColorStop(o: number, c: string) { this.stops.push([o, c]); } };
          gradients.push(gradient);
          return gradient;
        };
      }
      if (prop === 'getImageData' || prop === 'createImageData') {
        return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      }
      if (prop === 'getTransform') {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      if (prop in target) return target[prop];
      return record(prop);
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push({ name: `set:${prop}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    gradients,
    count: (name: string) => calls.filter((c) => c.name === name).length,
    texts: () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0] as string),
    fills: () => calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    reset: () => {
      calls.length = 0;
    },
  };
}

export const noop = vi.fn();
