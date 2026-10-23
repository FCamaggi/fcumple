import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './downloadCsv';

// jsdom no implementa Blob.text() ni Blob.arrayBuffer(): se lee con FileReader.
function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('downloadCsv', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    click.mockRestore();
  });

  it('descarga el contenido con el nombre indicado y limpia después', () => {
    downloadCsv('invitados.csv', 'a,b');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toContain('text/csv');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('con bom: antepone el BOM para que Excel lea bien las tildes', async () => {
    downloadCsv('invitados.csv', 'Acompañantes', { bom: true });
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const bytes = await readBytes(blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Acompañantes');
  });

  it('sin bom: el contenido va tal cual', async () => {
    downloadCsv('invitados.csv', 'abc');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(new TextDecoder().decode(await readBytes(blob))).toBe('abc');
  });
});
