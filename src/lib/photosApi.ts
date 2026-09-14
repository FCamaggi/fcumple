import { supabase } from './supabaseClient';
import type { Photo, PhotoQuota } from '../types';

const BUCKET = 'party-photos';
// Long enough for a moderation session or a guest browsing the revealed
// roll without the link expiring mid-scroll, short enough that a copied
// URL doesn't stay valid indefinitely (see supabase/README.md — the
// storage bucket is private, signed URLs are the only way in).
const SIGNED_URL_TTL_SECONDS = 60 * 10;

interface PhotoRow {
  id: string;
  guest_id: string;
  storage_path: string;
  status: Photo['status'];
  created_at: string;
}

function mapRow(row: PhotoRow): Photo {
  return {
    id: row.id,
    guestId: row.guest_id,
    storagePath: row.storage_path,
    status: row.status,
    createdAt: row.created_at,
  };
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`No pudimos ${action}: ${error?.message ?? 'error desconocido'}`);
}

// Mirrors get_photo_quota's convention (see supabase/README.md): a token
// with no matching guest returns 0 rows, not an exception.
export async function getPhotoQuota(token: string): Promise<PhotoQuota> {
  const { data, error } = await supabase.rpc('get_photo_quota', { p_token: token });

  if (error) fail('cargar tu cupo de fotos', error);

  const row = (data as Array<{ quota: number; used: number }> | null)?.[0];
  if (!row) {
    throw new Error('Este enlace de invitación ya no es válido.');
  }
  return { quota: row.quota, used: row.used };
}

// Uploads the (already compressed) blob to Storage at {token}/{uuid}.jpg,
// then registers its metadata via submit_photo. The two steps are not
// atomic: if the upload succeeds but submit_photo fails, the file is
// orphaned in Storage (anon has no delete policy to clean it up itself —
// see supabase/README.md). Rather than pretend that's a success, this
// throws a distinct, honest message for that case.
export async function uploadPhoto(token: string, blob: Blob): Promise<Photo> {
  const path = `${token}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
  });

  if (uploadError) {
    fail('subir la foto', uploadError);
  }

  const { data, error } = await supabase.rpc('submit_photo', { p_token: token, p_storage_path: path });

  if (error) {
    throw new Error(
      `La foto se subió pero no pudimos registrarla (${error.message ?? 'error desconocido'}). Avisale a alguien del staff.`,
    );
  }

  const row = (data as PhotoRow[] | null)?.[0];
  if (!row) {
    throw new Error('La foto se subió pero no pudimos registrarla. Avisale a alguien del staff.');
  }
  return mapRow(row);
}

export interface ModerationPhoto extends Photo {
  guestFullName: string;
}

interface ModerationPhotoRow extends PhotoRow {
  guests: { full_name: string } | null;
}

// Admin-only (RLS grants `authenticated` full access to `photos`). Uses
// supabase-js's embedded resource selection over the guest_id FK instead
// of two separate queries.
export async function listAllPhotosForModeration(): Promise<ModerationPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, guest_id, storage_path, status, created_at, guests(full_name)')
    .order('created_at', { ascending: false });

  if (error) fail('cargar las fotos', error);

  return ((data ?? []) as unknown as ModerationPhotoRow[]).map((row) => ({
    ...mapRow(row),
    guestFullName: row.guests?.full_name ?? 'Invitado desconocido',
  }));
}

export async function moderatePhoto(id: string, status: 'approved' | 'rejected'): Promise<Photo> {
  const { data, error } = await supabase.from('photos').update({ status }).eq('id', id).select().single();

  if (error) fail('actualizar la foto', error);
  return mapRow(data as unknown as PhotoRow);
}

// Used both by the admin (moderation queue) and the guest (revealed roll).
// The RLS policy on storage.objects (see supabase/README.md) is what
// actually decides whether the signed URL can be generated at all — this
// function doesn't need to know which role is calling it.
export async function getSignedPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) fail('generar el link de la foto', error);
  return (data as { signedUrl: string }).signedUrl;
}

// `anon` no tiene ningún grant sobre `public.photos` (revoke all, sin
// ninguna policy para ese rol -- ver supabase/README.md), así que la única
// vía de lectura es la RPC `list_revealed_photos()` (SECURITY DEFINER,
// supabase/migrations/20260912100008_rpc_list_revealed_photos.sql, con
// `created_at` sumado en 20260914100000_rpc_list_revealed_photos_created_at.sql).
// No expone `guest_id` ni `status` -- solo lo necesario para armar la URL
// firmada y agrupar por franja horaria (RevealedRoll / photoTimeline.ts).
export async function listRevealedPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase.rpc('list_revealed_photos');

  if (error) fail('cargar el rollo revelado', error);

  return ((data ?? []) as Array<{ storage_path: string; created_at: string }>).map((row) => ({
    id: row.storage_path,
    guestId: '',
    storagePath: row.storage_path,
    status: 'approved' as const,
    createdAt: row.created_at,
  }));
}
