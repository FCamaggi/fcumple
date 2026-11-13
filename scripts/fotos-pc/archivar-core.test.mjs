import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveBatch, localPathFor } from './archivar-core.mjs';

const EV = '11111111-1111-4111-8111-111111111111';
const GU = '22222222-2222-4222-8222-222222222222';
const PATH_A = `${EV}/${GU}/a.jpg`;

/** Un JPEG mínimo: empieza con FFD8 y termina con FFD9. */
const jpeg = (fill = 'x') => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from(fill.repeat(64)), Buffer.from([0xff, 0xd9])]);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-pc-test-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Storage y tabla falsos; `calls` registra el orden de las operaciones. */
function fakeDeps({ photos, storage, failRemove = false, failMark = false }) {
  const calls = [];
  const marked = new Set();
  return {
    calls,
    marked,
    storage,
    deps: {
      listPending: async (limit, after = null) =>
        photos
          .map((p, i) => ({ event_id: EV, guest_id: GU, created_at: `t${String(i).padStart(4, '0')}`, ...p }))
          .filter((p) => !marked.has(p.id) && (!after || p.created_at > after.created_at))
          .slice(0, limit),
      download: async (p) => {
        calls.push(['download', p]);
        return storage.has(p) ? Buffer.from(storage.get(p)) : null;
      },
      remove: async (p) => {
        calls.push(['remove', p]);
        if (failRemove) throw new Error('remove falló');
        storage.delete(p);
      },
      markArchived: async (id) => {
        calls.push(['mark', id]);
        if (failMark) throw new Error('mark falló');
        marked.add(id);
      },
      log: () => {},
    },
  };
}

describe('archiveBatch', () => {
  it('guarda el original en <dir>/<evento>/<invitado>/<archivo>, lo borra de Storage y después marca la foto', async () => {
    const original = jpeg('a');
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map([[PATH_A, original]]) });

    const summary = await archiveBatch(f.deps, { dir });

    const target = path.join(dir, EV, GU, 'a.jpg');
    expect(sha(fs.readFileSync(target))).toBe(sha(original));
    expect(f.calls).toEqual([
      ['download', PATH_A],
      ['remove', PATH_A],
      ['mark', 'p1'],
    ]);
    expect(f.storage.has(PATH_A)).toBe(false);
    expect(summary).toMatchObject({ archived: 1, recovered: 0, skipped: 0, failed: 0 });
    expect(fs.readdirSync(path.join(dir, EV, GU))).toEqual(['a.jpg']); // sin temporales
  });

  it('con --conservar-en-storage marca la foto sin borrarla de Storage', async () => {
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map([[PATH_A, jpeg()]]) });
    await archiveBatch(f.deps, { dir, keepInStorage: true });
    expect(f.calls.map(([op]) => op)).toEqual(['download', 'mark']);
    expect(f.storage.has(PATH_A)).toBe(true);
  });

  it('un archivo que no es un JPEG completo no se borra de Storage ni se marca, y no queda en disco', async () => {
    const truncated = jpeg().subarray(0, 30);
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map([[PATH_A, truncated]]) });

    const summary = await archiveBatch(f.deps, { dir });

    expect(f.calls.map(([op]) => op)).toEqual(['download']);
    expect(f.storage.has(PATH_A)).toBe(true);
    expect(fs.existsSync(path.join(dir, EV, GU, 'a.jpg'))).toBe(false);
    expect(summary).toMatchObject({ archived: 0, failed: 1 });
  });

  it('si borrar de Storage falla, no marca la foto y la reintenta en la vuelta siguiente', async () => {
    const original = jpeg();
    const storage = new Map([[PATH_A, original]]);
    const photos = [{ id: 'p1', storage_path: PATH_A }];
    const first = fakeDeps({ photos, storage, failRemove: true });

    expect(await archiveBatch(first.deps, { dir })).toMatchObject({ failed: 1 });
    expect(first.marked.has('p1')).toBe(false);
    expect(storage.has(PATH_A)).toBe(true);

    const second = fakeDeps({ photos, storage });
    expect(await archiveBatch(second.deps, { dir })).toMatchObject({ archived: 1 });
    expect(second.marked.has('p1')).toBe(true);
  });

  it('si se cayó entre borrar y marcar, en la vuelta siguiente reconoce el archivo en disco y marca la foto', async () => {
    const original = jpeg();
    const storage = new Map([[PATH_A, original]]);
    const photos = [{ id: 'p1', storage_path: PATH_A }];
    const first = fakeDeps({ photos, storage, failMark: true });
    await archiveBatch(first.deps, { dir });
    expect(storage.has(PATH_A)).toBe(false);

    const second = fakeDeps({ photos, storage });
    const summary = await archiveBatch(second.deps, { dir });

    expect(second.calls).toEqual([
      ['download', PATH_A],
      ['mark', 'p1'],
    ]);
    expect(summary).toMatchObject({ recovered: 1 });
  });

  it('sin el archivo en Storage ni en disco no marca nada (foto que nunca terminó de subir)', async () => {
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map() });
    const summary = await archiveBatch(f.deps, { dir });
    expect(f.calls.map(([op]) => op)).toEqual(['download']);
    expect(f.marked.size).toBe(0);
    expect(summary).toMatchObject({ skipped: 1 });
  });

  it('una ruta con otro formato no se descarga ni escribe fuera de la carpeta', async () => {
    const bad = `${EV}/${GU}/../../fuera.jpg`;
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: bad }], storage: new Map([[bad, jpeg()]]) });
    const summary = await archiveBatch(f.deps, { dir });
    expect(f.calls).toEqual([]);
    expect(fs.existsSync(path.join(dir, '..', 'fuera.jpg'))).toBe(false);
    expect(summary).toMatchObject({ failed: 1 });
  });

  it('un error con una foto no detiene las demás del lote', async () => {
    const pathB = `${EV}/${GU}/b.jpg`;
    const storage = new Map([
      [PATH_A, jpeg().subarray(0, 10)],
      [pathB, jpeg('b')],
    ]);
    const f = fakeDeps({
      photos: [
        { id: 'p1', storage_path: PATH_A },
        { id: 'p2', storage_path: pathB },
      ],
      storage,
    });
    const summary = await archiveBatch(f.deps, { dir });
    expect(summary).toMatchObject({ archived: 1, failed: 1 });
    expect(f.marked.has('p2')).toBe(true);
  });
});

describe('fotos que fallan o no existen no bloquean a las demás', () => {
  it('el lote avanza con un cursor: las atascadas no tapan a las nuevas y se reintentan en la vuelta completa siguiente', async () => {
    const orphans = Array.from({ length: 25 }, (_, i) => ({ id: `o${i}`, storage_path: `${EV}/${GU}/o${i}.jpg` }));
    const good = { id: 'g', storage_path: PATH_A };
    const f = fakeDeps({ photos: [...orphans, good], storage: new Map([[PATH_A, jpeg()]]) });
    const state = {};

    expect(await archiveBatch(f.deps, { dir, limit: 20, state })).toMatchObject({ skipped: 20, archived: 0 });
    expect(await archiveBatch(f.deps, { dir, limit: 20, state })).toMatchObject({ skipped: 5, archived: 1 });
    expect(f.marked.has('g')).toBe(true);
    // Terminó la vuelta completa (menos fotos que el lote): vuelve a empezar desde la más antigua.
    expect(await archiveBatch(f.deps, { dir, limit: 20, state })).toMatchObject({ skipped: 20 });
  });
});

describe('protecciones (verificación de T3)', () => {
  it('una fila cuya ruta no es de su evento e invitado no se descarga ni se borra de Storage', async () => {
    const OTHER = '33333333-3333-4333-8333-333333333333';
    const foreign = `${OTHER}/${GU}/x-display.jpg`;
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: foreign }], storage: new Map([[foreign, jpeg()]]) });
    const summary = await archiveBatch(f.deps, { dir });
    expect(f.calls).toEqual([]);
    expect(f.storage.has(foreign)).toBe(true);
    expect(summary).toMatchObject({ failed: 1 });
  });

  it('si quedó solo el temporal (corte de luz tras renombrar), lo recupera, lo deja con su nombre y marca la foto', async () => {
    const original = jpeg('t');
    fs.mkdirSync(path.join(dir, EV, GU), { recursive: true });
    fs.writeFileSync(path.join(dir, EV, GU, 'a.jpg.parcial-999'), original);
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map() });

    const summary = await archiveBatch(f.deps, { dir });

    expect(summary).toMatchObject({ recovered: 1 });
    expect(sha(fs.readFileSync(path.join(dir, EV, GU, 'a.jpg')))).toBe(sha(original));
    expect(fs.readdirSync(path.join(dir, EV, GU))).toEqual(['a.jpg']);
    expect(f.marked.has('p1')).toBe(true);
  });

  it('si ya hay otro archivo distinto en esa ruta, no lo pisa, no borra de Storage y no marca', async () => {
    const existing = jpeg('viejo');
    fs.mkdirSync(path.join(dir, EV, GU), { recursive: true });
    fs.writeFileSync(path.join(dir, EV, GU, 'a.jpg'), existing);
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map([[PATH_A, jpeg('nuevo')]]) });

    const summary = await archiveBatch(f.deps, { dir });

    expect(summary).toMatchObject({ failed: 1 });
    expect(sha(fs.readFileSync(path.join(dir, EV, GU, 'a.jpg')))).toBe(sha(existing));
    expect(f.storage.has(PATH_A)).toBe(true);
    expect(f.marked.size).toBe(0);
  });

  it('si el mismo archivo ya estaba en disco (reintento), sigue con el borrado y la marca', async () => {
    const original = jpeg();
    fs.mkdirSync(path.join(dir, EV, GU), { recursive: true });
    fs.writeFileSync(path.join(dir, EV, GU, 'a.jpg'), original);
    const f = fakeDeps({ photos: [{ id: 'p1', storage_path: PATH_A }], storage: new Map([[PATH_A, original]]) });
    expect(await archiveBatch(f.deps, { dir })).toMatchObject({ archived: 1 });
    expect(f.storage.has(PATH_A)).toBe(false);
  });
});

describe('localPathFor', () => {
  it('arma la ruta dentro de la carpeta y rechaza lo que no tiene el formato de submit_photo', () => {
    expect(localPathFor(dir, PATH_A)).toBe(path.join(dir, EV, GU, 'a.jpg'));
    for (const bad of [`${EV}/${GU}/sub/a.jpg`, `${EV}/${GU}/.a.jpg`, `${EV}/a.jpg`, `${EV}/${GU}/a.jpg\n`, `x/${GU}/a.jpg`]) {
      expect(() => localPathFor(dir, bad)).toThrow(/ruta/);
    }
  });
});
