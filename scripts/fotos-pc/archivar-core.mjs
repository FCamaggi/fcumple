/**
 * Núcleo del worker que archiva los originales en el PC del evento (T3 de odd/tasks/fotos-originales-pc.md).
 *
 * Orden por foto, pensado para no perder nunca un original aunque el PC se apague en cualquier punto:
 *   1. descargar el original de Storage;
 *   2. escribirlo en un temporal, forzarlo a disco y renombrarlo (nunca queda un archivo a medias);
 *   3. releerlo y verificar el hash y que sea un JPEG completo;
 *   4. recién ahí borrarlo de Storage (salvo con keepInStorage);
 *   5. marcar la foto con original_archived_at.
 * Si se cae entre 4 y 5, en la vuelta siguiente Storage responde "no está", el archivo válido sigue en disco y
 * la foto se marca. Tras renombrar se fuerza también la carpeta a disco; si aun así un corte de luz deja solo el
 * temporal, la recuperación lo encuentra y lo deja con su nombre.
 *
 * Protecciones: la ruta debe tener el formato de submit_photo y ser del evento y del invitado de la fila (un
 * dueño puede insertar filas con cualquier ruta, y el worker borra con la clave de servicio); un archivo distinto
 * que ya esté en la ruta nunca se pisa (en discos que no distinguen mayúsculas, `A.jpg` y `a.jpg` chocan).
 * Las dependencias (Storage y tabla) se inyectan para probarlo sin red.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** El mismo formato que exigen submit_photo y photo_original_url: {event_id}/{guest_id}/{archivo}. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ORIGINAL_PATH_RE = new RegExp(`^${UUID}/${UUID}/[A-Za-z0-9][A-Za-z0-9._-]{0,149}$`);

const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;

/** Ruta local del original. Lanza si `storagePath` no tiene el formato esperado (nunca escribe fuera de `dir`). */
export function localPathFor(dir, storagePath) {
  if (typeof storagePath !== 'string' || !ORIGINAL_PATH_RE.test(storagePath)) {
    throw new Error(`ruta con formato inesperado: ${JSON.stringify(storagePath)}`);
  }
  const root = path.resolve(dir);
  const target = path.resolve(root, ...storagePath.split('/'));
  if (!target.startsWith(root + path.sep)) throw new Error(`ruta fuera de la carpeta: ${storagePath}`);
  return target;
}

/** ¿Empieza con el marcador de inicio de JPEG (FFD8) y termina con el de fin (FFD9)? */
export function isCompleteJpeg(buf) {
  return (
    buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9
  );
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function readIfExists(file) {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Fuerza a disco la entrada de la carpeta (el rename). Windows no deja abrir carpetas así: ahí NTFS ya lo registra. */
async function syncDir(dir) {
  let handle;
  try {
    handle = await fs.open(dir, 'r');
    await handle.sync();
  } catch (err) {
    if (!['EISDIR', 'EPERM', 'EACCES', 'EINVAL'].includes(err.code)) throw err;
  } finally {
    await handle?.close();
  }
}

/** Temporales que dejó un corte de luz para esta ruta: `<archivo>.parcial-<pid>`. */
async function partialsFor(target) {
  const base = `${path.basename(target)}.parcial-`;
  let names;
  try {
    names = await fs.readdir(path.dirname(target));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.filter((n) => n.startsWith(base)).map((n) => path.join(path.dirname(target), n));
}

/** Escribe de forma atómica: temporal en la misma carpeta, fsync, rename y fsync de la carpeta. */
async function writeAtomic(target, buf) {
  await fs.mkdir(path.dirname(target), { recursive: true, mode: PRIVATE_DIR });
  const tmp = `${target}.parcial-${process.pid}`;
  const handle = await fs.open(tmp, 'w', PRIVATE_FILE);
  try {
    await handle.writeFile(buf);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  await syncDir(path.dirname(target));
}

/** Si quedó un temporal completo y no el archivo, lo deja con su nombre. Devuelve el contenido recuperado o null. */
async function recoverPartial(target) {
  for (const partial of await partialsFor(target)) {
    const buf = await fs.readFile(partial);
    if (isCompleteJpeg(buf)) {
      await fs.rename(partial, target);
      await syncDir(path.dirname(target));
      return buf;
    }
  }
  return null;
}

/**
 * Archiva una foto. Devuelve `archived`, `recovered` (ya estaba en disco y no en Storage), `skipped` (no está en
 * ningún lado: nunca terminó de subir) o lanza con el motivo.
 */
async function archivePhoto(photo, deps, { dir, keepInStorage }) {
  const target = localPathFor(dir, photo.storage_path);
  const [eventId, guestId] = photo.storage_path.split('/');
  if (eventId !== photo.event_id || guestId !== photo.guest_id) {
    throw new Error('la ruta no es del evento y el invitado de la fila');
  }

  const downloaded = await deps.download(photo.storage_path);

  if (downloaded === null) {
    const local = (await readIfExists(target)) ?? (await recoverPartial(target));
    if (local && isCompleteJpeg(local)) {
      await deps.markArchived(photo.id);
      return 'recovered';
    }
    return 'skipped';
  }

  if (!isCompleteJpeg(downloaded)) throw new Error('el archivo descargado no es un JPEG completo');
  const expected = sha256(downloaded);

  const existing = await readIfExists(target);
  if (existing && sha256(existing) !== expected) {
    throw new Error('ya hay otro archivo distinto en esa ruta; no se pisa');
  }
  if (!existing) await writeAtomic(target, downloaded);
  const written = await fs.readFile(target);
  if (sha256(written) !== expected) {
    await fs.rm(target, { force: true });
    throw new Error('el archivo en disco no coincide con lo descargado');
  }

  if (!keepInStorage) await deps.remove(photo.storage_path);
  await deps.markArchived(photo.id);
  return 'archived';
}

/**
 * Una vuelta: toma hasta `limit` fotos sin archivar, más antiguas primero, desde `state.cursor`, y las procesa
 * en serie. Un error con una foto se registra y no detiene las demás. El cursor avanza aunque una foto falle, así
 * unas pocas atascadas no tapan a las nuevas; cuando una vuelta trae menos fotos que el lote, el cursor vuelve al
 * principio y las pendientes se reintentan.
 */
export async function archiveBatch(deps, { dir, keepInStorage = false, limit = 20, state = {} }) {
  const summary = { archived: 0, recovered: 0, skipped: 0, failed: 0 };
  const photos = await deps.listPending(limit, state.cursor ?? null);
  for (const photo of photos) {
    let result;
    try {
      result = await archivePhoto(photo, deps, { dir, keepInStorage });
      deps.log(`${result} ${photo.storage_path}`);
    } catch (err) {
      result = 'failed';
      deps.log(`falló ${photo.storage_path}: ${err.message}`);
    }
    summary[result] += 1;
  }
  state.cursor = photos.length < limit ? null : { created_at: photos.at(-1).created_at, id: photos.at(-1).id };
  return summary;
}
