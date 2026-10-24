import { supabase } from './supabaseClient';
import type { Photo, Post } from '../types';
import { sanitizeFrameParams, type FrameParams, type FrameTemplate } from './cameraAssets/frames';

/**
 * Lecturas y subidas del invitado en la Fase 1. A diferencia de la Fase 0:
 * - los avisos y el rollo salen de RPC que derivan el evento del slug o del
 *   token del invitado (no hay "el único evento");
 * - las rutas de Storage son `{event_id}/{guest_id}/…`: el token NUNCA va en
 *   una ruta, porque `list_revealed_photos` las entrega a todo el evento.
 */

const BUCKET = 'party-photos';

export interface GuestIdentity {
  token: string;
  eventId: string;
  guestId: string;
}

export interface RevealedPhoto {
  storagePath: string;
  displayStoragePath: string | null;
  createdAt: string;
}

interface PostRow {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  cover_image_path: string | null;
  published_at: string | null;
  images: string[] | null;
}

export async function listPublishedPosts(slug: string): Promise<Post[]> {
  const { data, error } = await supabase.rpc('list_published_posts', { p_slug: slug });
  if (error) throw new Error('No pudimos cargar los avisos.');
  return ((data ?? []) as PostRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    coverImagePath: row.cover_image_path,
    publishedAt: row.published_at,
    createdAt: row.published_at ?? '',
    galleryPaths: row.images ?? [],
  }));
}

export async function getPublicHeadcount(slug: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_public_headcount', { p_slug: slug });
  if (error) throw new Error('No pudimos cargar el aforo.');
  return typeof data === 'number' ? data : 0;
}

export async function listRevealedPhotosForGuest(token: string): Promise<RevealedPhoto[]> {
  const { data, error } = await supabase.rpc('list_revealed_photos', { p_token: token });
  if (error) throw new Error('No pudimos cargar el rollo revelado.');
  return (
    (data ?? []) as Array<{ storage_path: string; display_storage_path: string | null; created_at: string }>
  ).map((row) => ({
    storagePath: row.storage_path,
    displayStoragePath: row.display_storage_path ?? null,
    createdAt: row.created_at,
  }));
}

// La ruta se decide una vez por archivo: el mismo `Blob` siempre usa el mismo UUID.
// Contrato: un Blob = una foto (reusar el mismo Blob para otra foto devolvería la primera).
const uuidByBlob = new WeakMap<Blob, string>();

function uuidFor(blob: Blob): string {
  let uuid = uuidByBlob.get(blob);
  if (!uuid) {
    uuid = crypto.randomUUID();
    uuidByBlob.set(blob, uuid);
  }
  return uuid;
}

/** Storage responde 409 «The resource already exists» si esa ruta ya se subió. */
function alreadyUploaded(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  // Con código manda el código; el mensaje solo vale si el error no trae ninguno.
  if (error.statusCode !== undefined) return String(error.statusCode) === '409';
  return /already exists/i.test(error.message ?? '');
}

/**
 * Sube la foto (y su copia liviana, best-effort) a `{event_id}/{guest_id}/…` y
 * registra su metadata con `submit_photo`. Igual que en la Fase 0, los dos
 * pasos no son atómicos: si la subida funciona pero el registro falla, el
 * archivo queda huérfano y el mensaje lo dice con honestidad.
 *
 * Reintentar es seguro: como el mismo archivo conserva su ruta, un reintento tras
 * una respuesta perdida cae en la misma fila (`submit_photo` es idempotente por
 * ruta) y no gasta otro disparo. Un archivo que ya estaba en Storage (409) cuenta
 * como subido.
 */
export async function uploadGuestPhoto(identity: GuestIdentity, blob: Blob, displayBlob?: Blob | null): Promise<Photo> {
  const uuid = uuidFor(blob);
  const folder = `${identity.eventId}/${identity.guestId}`;
  const path = `${folder}/${uuid}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
  });
  if (uploadError && !alreadyUploaded(uploadError)) {
    throw new Error('No pudimos subir la foto. Intenta de nuevo.');
  }

  let displayPath: string | null = null;
  if (displayBlob) {
    const candidate = `${folder}/${uuid}-display.jpg`;
    const { error: displayError } = await supabase.storage.from(BUCKET).upload(candidate, displayBlob, {
      contentType: 'image/jpeg',
    });
    if (!displayError || alreadyUploaded(displayError)) displayPath = candidate;
  }

  const { data, error } = await supabase.rpc('submit_photo', {
    p_token: identity.token,
    p_storage_path: path,
    p_display_storage_path: displayPath,
  });

  if (error) {
    throw new Error(
      error.code === '22023'
        ? 'Ya usaste todos los disparos de tu rollo.'
        : error.code === '42501'
          ? 'La cámara todavía no está habilitada para ti. Pasa por la puerta para que marquen tu llegada.'
          : 'La foto se subió pero no pudimos registrarla. Avísale a quien organiza.',
    );
  }

  const row = (data as Array<{
    id: string;
    guest_id: string;
    storage_path: string;
    display_storage_path: string | null;
    status: Photo['status'];
    created_at: string;
  }> | null)?.[0];
  if (!row) {
    throw new Error('La foto se subió pero no pudimos registrarla. Avísale a quien organiza.');
  }

  return {
    id: row.id,
    guestId: row.guest_id,
    storagePath: row.storage_path,
    displayStoragePath: row.display_storage_path ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// --- Marcos y stickers del evento ---------------------------------------------

export interface GuestFrame {
  id: string;
  label: string;
  template: FrameTemplate;
  params: FrameParams;
  isDefault: boolean;
}

export interface GuestSticker {
  id: string;
  kind: 'emoji' | 'image';
  emoji: string | null;
  storagePath: string | null;
}

interface CameraAssetRow {
  asset_type: 'frame' | 'sticker';
  id: string;
  label: string | null;
  template: FrameTemplate | null;
  params: unknown;
  emoji: string | null;
  storage_path: string | null;
  is_default: boolean;
}

/** Solo lo ACTIVO del evento del invitado, ya filtrado por los interruptores globales. */
export async function listCameraAssets(token: string): Promise<{ frames: GuestFrame[]; stickers: GuestSticker[] }> {
  const { data, error } = await supabase.rpc('list_event_camera_assets', { p_token: token });
  if (error) throw new Error('No pudimos cargar los marcos y stickers.');

  const rows = (data ?? []) as CameraAssetRow[];
  return {
    frames: rows
      .filter((r) => r.asset_type === 'frame' && r.template)
      .map((r) => ({
        id: r.id,
        label: r.label ?? '',
        template: r.template as FrameTemplate,
        params: sanitizeFrameParams(r.params),
        isDefault: r.is_default,
      })),
    stickers: rows
      .filter((r) => r.asset_type === 'sticker')
      .map((r) => ({
        id: r.id,
        kind: r.storage_path ? ('image' as const) : ('emoji' as const),
        emoji: r.emoji,
        storagePath: r.storage_path,
      })),
  };
}

/** URL firmada de la imagen de un sticker (el bucket es privado). */
export async function getStickerImageUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('event-assets').createSignedUrl(storagePath, 60 * 60);
  if (error || !data) throw new Error('No pudimos cargar un sticker.');
  return data.signedUrl;
}
