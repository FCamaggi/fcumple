import { Zip, ZipPassThrough } from 'fflate';
import { supabase } from './supabaseClient';
import type { ModerationPhoto } from './photosApi';

const BUCKET = 'party-photos';
// Descargas en paralelo: suficiente para ir rápido sin saturar el celular ni Storage.
const CONCURRENCY = 4;

/** Quita lo que los sistemas de archivos no aceptan y deja un nombre corto y legible. */
export function safeFileName(raw: string, fallback = 'invitado'): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60)
    .trim();
  return cleaned || fallback;
}

export interface ExportEntry {
  photo: ModerationPhoto;
  /** Ruta dentro del zip: `Nombre Apellido/Nombre Apellido 001.jpg`. */
  zipPath: string;
}

/**
 * Decide qué fotos van y cómo se llaman: una carpeta por invitado y los archivos numerados en orden de llegada.
 * Dos invitados con el mismo nombre no se mezclan (el segundo lleva el comienzo de su id). Siempre son los
 * ORIGINALES (`storagePath`), nunca la copia liviana `-display`.
 */
export function planExport(photos: readonly ModerationPhoto[], includeAll: boolean): ExportEntry[] {
  const chosen = photos
    .filter((p) => includeAll || p.status === 'approved')
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const folderByGuest = new Map<string, string>();
  const usedFolders = new Set<string>();
  const counters = new Map<string, number>();

  return chosen.map((photo) => {
    let folder = folderByGuest.get(photo.guestId);
    if (!folder) {
      const base = safeFileName(photo.guestFullName);
      folder = usedFolders.has(base.toLowerCase()) ? `${base} (${photo.guestId.slice(0, 6)})` : base;
      usedFolders.add(folder.toLowerCase());
      folderByGuest.set(photo.guestId, folder);
    }
    const n = (counters.get(folder) ?? 0) + 1;
    counters.set(folder, n);
    return { photo, zipPath: `${folder}/${folder} ${String(n).padStart(3, '0')}.jpg` };
  });
}

export interface ExportProgress {
  done: number;
  total: number;
  failed: number;
}

export interface ExportResult {
  blob: Blob;
  total: number;
  failed: number;
}

type Downloader = (storagePath: string) => Promise<Uint8Array>;

async function downloadOriginal(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error('No pudimos descargar una foto.');
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Baja los originales y arma un .zip sin recomprimir (los JPG ya vienen comprimidos). Los trozos del zip se
 * acumulan como `Blob`, no como una sola memoria gigante. Una foto que falla se cuenta en `failed` y el resto sigue.
 */
export async function buildPhotosZip(
  entries: readonly ExportEntry[],
  onProgress?: (p: ExportProgress) => void,
  download: Downloader = downloadOriginal,
): Promise<ExportResult> {
  const parts: BlobPart[] = [];
  let finish: () => void = () => undefined;
  let fail: (e: Error) => void = () => undefined;
  const finished = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    parts.push(chunk as BlobPart);
    if (final) finish();
  });

  const progress: ExportProgress = { done: 0, total: entries.length, failed: 0 };
  let next = 0;
  // Los archivos se agregan al zip de a uno (el zip es secuencial); las descargas sí van en paralelo.
  let writing: Promise<void> = Promise.resolve();

  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      let bytes: Uint8Array | null = null;
      try {
        bytes = await download(entry.photo.storagePath);
      } catch {
        progress.failed += 1;
      }
      const toWrite = bytes;
      writing = writing.then(() => {
        if (toWrite) {
          const file = new ZipPassThrough(entry.zipPath);
          zip.add(file);
          file.push(toWrite, true);
        }
        progress.done += 1;
        onProgress?.({ ...progress });
      });
      await writing;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  await writing;
  zip.end();
  await finished;

  return { blob: new Blob(parts, { type: 'application/zip' }), total: entries.length, failed: progress.failed };
}

/** Dispara la descarga en el navegador. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
