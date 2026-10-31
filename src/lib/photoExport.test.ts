import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));

import { buildPhotosZip, planExport, safeFileName } from './photoExport';
import type { ModerationPhoto } from './photosApi';

function photo(over: Partial<ModerationPhoto> & { id: string }): ModerationPhoto {
  return {
    guestId: 'g1',
    storagePath: `ev/g1/${over.id}.jpg`,
    displayStoragePath: `ev/g1/${over.id}-display.jpg`,
    status: 'approved',
    createdAt: '2026-10-30T20:00:00Z',
    guestFullName: 'Ana Pérez',
    ...over,
  };
}

// jsdom no implementa Blob.arrayBuffer().
function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('safeFileName', () => {
  it('quita caracteres inválidos y conserva tildes', () => {
    expect(safeFileName('Ana/Pérez: "la" <mejor>?')).toBe('AnaPérez la mejor');
  });
  it('usa el respaldo si queda vacío', () => {
    expect(safeFileName('///')).toBe('invitado');
  });
});

describe('planExport', () => {
  it('por defecto solo aprobadas, y usa el original, no la copia display', () => {
    const plan = planExport(
      [photo({ id: 'a' }), photo({ id: 'b', status: 'pending' }), photo({ id: 'c', status: 'rejected' })],
      false,
    );
    expect(plan.map((e) => e.photo.id)).toEqual(['a']);
    expect(plan[0].photo.storagePath).toBe('ev/g1/a.jpg');
  });

  it('con includeAll incluye todas', () => {
    const plan = planExport([photo({ id: 'a' }), photo({ id: 'b', status: 'rejected' })], true);
    expect(plan).toHaveLength(2);
  });

  it('numera por invitado en orden de llegada', () => {
    const plan = planExport(
      [photo({ id: 'b', createdAt: '2026-10-30T21:00:00Z' }), photo({ id: 'a', createdAt: '2026-10-30T20:00:00Z' })],
      false,
    );
    expect(plan.map((e) => e.zipPath)).toEqual(['Ana Pérez/Ana Pérez 001.jpg', 'Ana Pérez/Ana Pérez 002.jpg']);
  });

  it('no mezcla a dos invitados con el mismo nombre', () => {
    const plan = planExport([photo({ id: 'a', guestId: 'aaaaaa-1' }), photo({ id: 'b', guestId: 'bbbbbb-2' })], false);
    expect(new Set(plan.map((e) => e.zipPath.split('/')[0])).size).toBe(2);
  });
});

describe('buildPhotosZip', () => {
  it('arma un zip con los bytes originales y cuenta los fallos', async () => {
    const plan = planExport([photo({ id: 'a' }), photo({ id: 'b', createdAt: '2026-10-30T21:00:00Z' })], false);
    const download = vi.fn(async (path: string) => {
      if (path.endsWith('b.jpg')) throw new Error('boom');
      return new Uint8Array([1, 2, 3]);
    });
    const progress = vi.fn();
    const result = await buildPhotosZip(plan, progress, download);

    expect(result.total).toBe(2);
    expect(result.failed).toBe(1);
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, failed: 1 });
    const files = unzipSync(await blobBytes(result.blob));
    expect(Object.keys(files)).toEqual(['Ana Pérez/Ana Pérez 001.jpg']);
    expect([...files['Ana Pérez/Ana Pérez 001.jpg']]).toEqual([1, 2, 3]);
  });

  it('con cero fotos igual produce un zip válido', async () => {
    const result = await buildPhotosZip([], undefined, async () => new Uint8Array());
    expect(result.blob.size).toBeGreaterThan(0);
  });
});
