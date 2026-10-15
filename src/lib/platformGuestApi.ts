import { supabase } from './supabaseClient';
import type { Photo, Post } from '../types';

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

/**
 * Sube la foto (y su copia liviana, best-effort) a `{event_id}/{guest_id}/…` y
 * registra su metadata con `submit_photo`. Igual que en la Fase 0, los dos
 * pasos no son atómicos: si la subida funciona pero el registro falla, el
 * archivo queda huérfano y el mensaje lo dice con honestidad.
 */
export async function uploadGuestPhoto(identity: GuestIdentity, blob: Blob, displayBlob?: Blob | null): Promise<Photo> {
  const uuid = crypto.randomUUID();
  const folder = `${identity.eventId}/${identity.guestId}`;
  const path = `${folder}/${uuid}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
  });
  if (uploadError) {
    throw new Error('No pudimos subir la foto. Intenta de nuevo.');
  }

  let displayPath: string | null = null;
  if (displayBlob) {
    const candidate = `${folder}/${uuid}-display.jpg`;
    const { error: displayError } = await supabase.storage.from(BUCKET).upload(candidate, displayBlob, {
      contentType: 'image/jpeg',
    });
    if (!displayError) displayPath = candidate;
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
