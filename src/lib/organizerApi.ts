import { supabase } from './supabaseClient';
import {
  parseGuestAnswers,
  resolveEnrollmentConfig,
  serializeEnrollmentConfig,
  type GuestAnswers,
  type ResolvedEnrollment,
} from './enrollmentConfig';
import { resolveWishlist, type WishlistConfig } from './wishlist';
import type { AccessMode } from './platformApi';
import type { ModerationPhoto } from './photosApi';
import type { Photo } from '../types';

/**
 * Capa de acceso del organizador (Fase 1). Todo pasa por las políticas RLS de
 * supabase/: un organizador solo ve y modifica lo de sus eventos.
 */

export type CameraUnlock = 'on_identify' | 'on_checkin' | 'on_event_qr';
export type ApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface OrganizerEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string | null;
  location: string | null;
  accessMode: AccessMode;
  cameraUnlock: CameraUnlock;
  /** Hora límite de la cámara (ISO): pasada, la base rechaza las fotos nuevas. `null` = sin límite. */
  cameraClosesAt?: string | null;
  rsvpEnabled: boolean;
  framesEnabled: boolean;
  stickersEnabled: boolean;
  defaultFrameId: string | null;
  photosRevealedAt: string | null;
  /** Línea debajo del título (p. ej. «Cumpleaños Fran» bajo «PUTI HALLOWEEN»). */
  subtitle: string | null;
  /** Estilo del evento tal como lo guarda la base (`{preset}`); `resolveTheme` lo convierte en colores. */
  theme: unknown;
  /** Código secreto del QR impreso de la fiesta (solo lo ve la organizadora; los invitados nunca). */
  activationCode: string;
  /** Fotos que recibe cada invitado nuevo. */
  defaultPhotoQuota: number;
  /** Qué le pide el organizador al invitado al inscribirse. */
  enrollment: ResolvedEnrollment;
  /** Lista de deseos / regalos configurada por el organizador. */
  wishlist?: WishlistConfig;
  createdAt: string;
}

export interface OrganizerGuest {
  id: string;
  eventId: string;
  fullName: string;
  token: string;
  approvalStatus: ApprovalStatus;
  status: 'pending' | 'confirmed' | 'declined';
  plusOnesAllowed: number;
  plusOnesConfirmed: number;
  photoQuota: number;
  /** Lo que respondió al inscribirse (acompañantes, comentario, preguntas propias). */
  answers: GuestAnswers;
  plusOnesRequested: number;
  checkedInAt: string | null;
  claimedAt: string | null;
  lastSeenAt: string | null;
  /** Cuándo escaneó el QR del evento y se le habilitó la cámara (`guests.camera_activated_at`). */
  cameraActivatedAt: string | null;
}

interface EventRow {
  id: string;
  slug: string;
  name: string;
  starts_at: string | null;
  location: string | null;
  access_mode: AccessMode;
  camera_unlock: CameraUnlock;
  camera_closes_at?: string | null;
  rsvp_enabled: boolean;
  frames_enabled: boolean;
  stickers_enabled: boolean;
  default_frame_id: string | null;
  photos_revealed_at: string | null;
  default_photo_quota: number;
  enrollment_config: unknown;
  subtitle: string | null;
  theme: unknown;
  activation_code: string;
  wishlist?: unknown;
  created_at: string;
}

interface GuestRow {
  id: string;
  event_id: string;
  full_name: string;
  token: string;
  approval_status: ApprovalStatus;
  status: 'pending' | 'confirmed' | 'declined';
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  photo_quota: number;
  guest_answers: unknown;
  plus_ones_requested: number;
  checked_in_at: string | null;
  claimed_at: string | null;
  last_seen_at: string | null;
  camera_activated_at?: string | null;
}

function mapEvent(row: EventRow): OrganizerEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    startsAt: row.starts_at,
    location: row.location,
    accessMode: row.access_mode,
    cameraUnlock: row.camera_unlock,
    cameraClosesAt: row.camera_closes_at ?? null,
    rsvpEnabled: row.rsvp_enabled,
    framesEnabled: row.frames_enabled,
    stickersEnabled: row.stickers_enabled,
    defaultFrameId: row.default_frame_id,
    photosRevealedAt: row.photos_revealed_at,
    subtitle: row.subtitle ?? null,
    theme: row.theme ?? {},
    activationCode: row.activation_code,
    defaultPhotoQuota: row.default_photo_quota,
    enrollment: resolveEnrollmentConfig(row.enrollment_config),
    wishlist: resolveWishlist(row.wishlist),
    createdAt: row.created_at,
  };
}

function mapGuest(row: GuestRow): OrganizerGuest {
  return {
    id: row.id,
    eventId: row.event_id,
    fullName: row.full_name,
    token: row.token,
    approvalStatus: row.approval_status,
    status: row.status,
    plusOnesAllowed: row.plus_ones_allowed,
    plusOnesConfirmed: row.plus_ones_confirmed,
    photoQuota: row.photo_quota,
    answers: parseGuestAnswers(row.guest_answers),
    plusOnesRequested: row.plus_ones_requested ?? 0,
    checkedInAt: row.checked_in_at,
    claimedAt: row.claimed_at,
    lastSeenAt: row.last_seen_at,
    cameraActivatedAt: row.camera_activated_at ?? null,
  };
}

interface DbError {
  code?: string;
  message?: string;
}

function guestError(error: DbError): Error {
  switch (error.code) {
    case '23514':
      return new Error('Cada invitado necesita nombre y apellido (dos palabras).');
    case '23505':
      return new Error('Ya hay alguien con ese nombre en la lista. Agrega el segundo apellido para distinguirlos.');
    case '42501':
      return new Error('No tienes permiso para modificar este evento.');
    default:
      return new Error('No pudimos guardar el cambio. Intenta de nuevo en un momento.');
  }
}

export async function listMyEvents(): Promise<OrganizerEvent[]> {
  const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false });
  if (error) throw new Error('No pudimos cargar tus eventos.');
  return ((data ?? []) as EventRow[]).map(mapEvent);
}

export async function getMyEvent(eventId: string): Promise<OrganizerEvent | null> {
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw new Error('No pudimos cargar el evento.');
  return data ? mapEvent(data as EventRow) : null;
}

export interface CreateEventInput {
  name: string;
  startsAt?: string | null;
  location?: string | null;
}

export async function createEvent(input: CreateEventInput): Promise<OrganizerEvent> {
  const { data, error } = await supabase.rpc('create_event', {
    p_name: input.name,
    p_starts_at: input.startsAt ?? null,
    p_location: input.location ?? null,
  });
  if (error) {
    throw new Error(
      error.code === '23514'
        ? 'Ponle un nombre al evento.'
        : error.code === '53400'
          ? 'Llegaste al máximo de eventos por cuenta (10).'
          : 'No pudimos crear el evento. Intenta de nuevo.',
    );
  }
  const row = (data as EventRow[] | null)?.[0];
  if (!row) throw new Error('No pudimos crear el evento. Intenta de nuevo.');
  return mapEvent(row);
}

export interface EventSettingsPatch {
  name?: string;
  startsAt?: string | null;
  location?: string | null;
  accessMode?: AccessMode;
  cameraUnlock?: CameraUnlock;
  /** ISO, o `null` para quitar el límite. */
  cameraClosesAt?: string | null;
  rsvpEnabled?: boolean;
  framesEnabled?: boolean;
  stickersEnabled?: boolean;
  defaultFrameId?: string | null;
  defaultPhotoQuota?: number;
  enrollment?: ResolvedEnrollment;
  subtitle?: string | null;
  /** Solo el id del preset: los colores viven en `src/lib/theme.ts`. */
  theme?: { preset: string };
  wishlist?: WishlistConfig;
}

export async function updateEvent(eventId: string, patch: EventSettingsPatch): Promise<OrganizerEvent> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.accessMode !== undefined) row.access_mode = patch.accessMode;
  if (patch.cameraUnlock !== undefined) row.camera_unlock = patch.cameraUnlock;
  if (patch.cameraClosesAt !== undefined) row.camera_closes_at = patch.cameraClosesAt;
  if (patch.rsvpEnabled !== undefined) row.rsvp_enabled = patch.rsvpEnabled;
  if (patch.framesEnabled !== undefined) row.frames_enabled = patch.framesEnabled;
  if (patch.stickersEnabled !== undefined) row.stickers_enabled = patch.stickersEnabled;
  if (patch.defaultFrameId !== undefined) row.default_frame_id = patch.defaultFrameId;
  if (patch.defaultPhotoQuota !== undefined) row.default_photo_quota = patch.defaultPhotoQuota;
  if (patch.enrollment !== undefined) row.enrollment_config = serializeEnrollmentConfig(patch.enrollment);
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.wishlist !== undefined) row.wishlist = patch.wishlist;

  const { data, error } = await supabase.from('events').update(row).eq('id', eventId).select('*').single();
  if (error) {
    throw new Error(
      error.code === '23514'
        ? 'Alguno de los valores no es válido: revisa los largos y las cantidades.'
        : 'No pudimos guardar los ajustes del evento.',
    );
  }
  return mapEvent(data as EventRow);
}

export async function listEventGuests(eventId: string): Promise<OrganizerGuest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('No pudimos cargar la lista de invitados.');
  return ((data ?? []) as GuestRow[]).map(mapGuest);
}

/** `photoQuota`: cupo del invitado; sin él, el que da la base (5). Pasa el del evento para ser coherente con la inscripción. */
export async function addGuest(eventId: string, fullName: string, photoQuota?: number): Promise<OrganizerGuest> {
  const { data, error } = await supabase
    .from('guests')
    .insert(
      photoQuota === undefined
        ? { event_id: eventId, full_name: fullName }
        : { event_id: eventId, full_name: fullName, photo_quota: photoQuota },
    )
    .select('*')
    .single();
  if (error) throw guestError(error);
  return mapGuest(data as GuestRow);
}

export interface AddGuestsResult {
  created: OrganizerGuest[];
  failed: Array<{ name: string; reason: string }>;
}

/** Alta masiva (un nombre por línea): sigue con el resto aunque alguno falle. */
export async function addGuests(eventId: string, names: string[], photoQuota?: number): Promise<AddGuestsResult> {
  const result: AddGuestsResult = { created: [], failed: [] };
  for (const name of names) {
    try {
      result.created.push(await addGuest(eventId, name, photoQuota));
    } catch (err) {
      result.failed.push({ name, reason: err instanceof Error ? err.message : 'Error desconocido.' });
    }
  }
  return result;
}

export async function setGuestApproval(guestId: string, approvalStatus: ApprovalStatus): Promise<OrganizerGuest> {
  const { data, error } = await supabase
    .from('guests')
    .update({ approval_status: approvalStatus })
    .eq('id', guestId)
    .select('*')
    .single();
  if (error) throw guestError(error);
  return mapGuest(data as GuestRow);
}

/**
 * Resuelve la solicitud de acompañantes de un invitado. Aprobar sube su cupo (sin bajar uno mayor que ya tuviera)
 * y los confirma; no aprobar deja la solicitud en 0 (los nombres siguen en sus respuestas).
 */
export async function setGuestPlusOnes(guest: OrganizerGuest, approve: boolean): Promise<OrganizerGuest> {
  const requested = guest.plusOnesRequested;
  const patch = approve
    ? { plus_ones_allowed: Math.max(guest.plusOnesAllowed, requested), plus_ones_confirmed: requested }
    : { plus_ones_requested: 0 };
  const { data, error } = await supabase.from('guests').update(patch).eq('id', guest.id).select('*').single();
  if (error) throw guestError(error);
  return mapGuest(data as GuestRow);
}

export async function removeGuest(guestId: string): Promise<void> {
  const { error } = await supabase.from('guests').delete().eq('id', guestId);
  if (error) throw guestError(error);
}

export async function regenerateGuestToken(guestId: string): Promise<OrganizerGuest> {
  const { data, error } = await supabase.rpc('regenerate_guest_token', { p_guest_id: guestId });
  if (error) throw guestError(error);
  const row = (data as GuestRow[] | null)?.[0];
  if (!row) throw new Error('No pudimos regenerar el acceso de esa persona.');
  return mapGuest(row);
}

// --- Fotos del evento (moderación y revelado) -------------------------------

interface EventPhotoRow {
  id: string;
  guest_id: string;
  storage_path: string;
  display_storage_path: string | null;
  status: Photo['status'];
  created_at: string;
  published_at: string | null;
  guests: { full_name: string } | null;
}

/** Fotos de UN evento del organizador (la RLS ya limita a los suyos). */
export async function listEventPhotos(eventId: string): Promise<ModerationPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, guest_id, storage_path, display_storage_path, status, created_at, published_at, guests!photos_guest_same_event(full_name)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('No pudimos cargar las fotos del evento.');
  return ((data ?? []) as unknown as EventPhotoRow[]).map((row) => ({
    id: row.id,
    guestId: row.guest_id,
    storagePath: row.storage_path,
    displayStoragePath: row.display_storage_path ?? null,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at ?? null,
    guestFullName: row.guests?.full_name ?? 'Invitado desconocido',
  }));
}

export async function moderateEventPhoto(photoId: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.from('photos').update({ status }).eq('id', photoId);
  if (error) throw new Error('No pudimos actualizar la foto.');
}

/**
 * Publica el lote: todas las fotos aprobadas que todavía no se habían publicado. Los invitados las ven en la
 * cartelera apenas se publican. Se puede repetir durante la fiesta. Devuelve cuántas fotos se publicaron.
 */
export async function publishPhotoBatch(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_photo_batch', { p_event_id: eventId });
  if (error) {
    throw new Error(
      error.code === '42501'
        ? 'Solo la dueña del evento puede publicar fotos.'
        : 'No pudimos publicar las fotos. Intenta de nuevo en un momento.',
    );
  }
  return typeof data === 'number' ? data : 0;
}

/** Cambia el código del QR impreso: el QR anterior deja de servir (quien ya activó la cámara sigue activado). */
export async function rotateActivationCode(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_activation_code', { p_event_id: eventId });
  if (error || typeof data !== 'string') {
    throw new Error('No pudimos cambiar el código. Intenta de nuevo en un momento.');
  }
  return data;
}
