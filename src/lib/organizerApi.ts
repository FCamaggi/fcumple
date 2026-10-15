import { supabase } from './supabaseClient';
import type { AccessMode } from './platformApi';
import type { ModerationPhoto } from './photosApi';
import type { Photo } from '../types';

/**
 * Capa de acceso del organizador (Fase 1). Todo pasa por las políticas RLS de
 * supabase/fase-1/: un organizador solo ve y modifica lo de sus eventos.
 */

export type CameraUnlock = 'on_identify' | 'on_checkin';
export type ApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface OrganizerEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string | null;
  location: string | null;
  accessMode: AccessMode;
  cameraUnlock: CameraUnlock;
  rsvpEnabled: boolean;
  photosRevealedAt: string | null;
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
  checkedInAt: string | null;
  claimedAt: string | null;
  lastSeenAt: string | null;
}

interface EventRow {
  id: string;
  slug: string;
  name: string;
  starts_at: string | null;
  location: string | null;
  access_mode: AccessMode;
  camera_unlock: CameraUnlock;
  rsvp_enabled: boolean;
  photos_revealed_at: string | null;
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
  checked_in_at: string | null;
  claimed_at: string | null;
  last_seen_at: string | null;
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
    rsvpEnabled: row.rsvp_enabled,
    photosRevealedAt: row.photos_revealed_at,
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
    checkedInAt: row.checked_in_at,
    claimedAt: row.claimed_at,
    lastSeenAt: row.last_seen_at,
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
  rsvpEnabled?: boolean;
}

export async function updateEvent(eventId: string, patch: EventSettingsPatch): Promise<OrganizerEvent> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.startsAt !== undefined) row.starts_at = patch.startsAt;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.accessMode !== undefined) row.access_mode = patch.accessMode;
  if (patch.cameraUnlock !== undefined) row.camera_unlock = patch.cameraUnlock;
  if (patch.rsvpEnabled !== undefined) row.rsvp_enabled = patch.rsvpEnabled;

  const { data, error } = await supabase.from('events').update(row).eq('id', eventId).select('*').single();
  if (error) throw new Error('No pudimos guardar los ajustes del evento.');
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

export async function addGuest(eventId: string, fullName: string): Promise<OrganizerGuest> {
  const { data, error } = await supabase
    .from('guests')
    .insert({ event_id: eventId, full_name: fullName })
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
export async function addGuests(eventId: string, names: string[]): Promise<AddGuestsResult> {
  const result: AddGuestsResult = { created: [], failed: [] };
  for (const name of names) {
    try {
      result.created.push(await addGuest(eventId, name));
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
  guests: { full_name: string } | null;
}

/** Fotos de UN evento del organizador (la RLS ya limita a los suyos). */
export async function listEventPhotos(eventId: string): Promise<ModerationPhoto[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, guest_id, storage_path, display_storage_path, status, created_at, guests!photos_guest_same_event(full_name)')
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
    guestFullName: row.guests?.full_name ?? 'Invitado desconocido',
  }));
}

export async function moderateEventPhoto(photoId: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.from('photos').update({ status }).eq('id', photoId);
  if (error) throw new Error('No pudimos actualizar la foto.');
}

/** Revela el rollo del evento (ahora). No se puede deshacer desde la app. */
export async function revealEventPhotos(eventId: string): Promise<OrganizerEvent> {
  const { data, error } = await supabase
    .from('events')
    .update({ photos_revealed_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('photos_revealed_at', null)
    .select('*')
    .single();
  if (error) throw new Error('No pudimos revelar el rollo. Puede que ya esté revelado.');
  return mapEvent(data as EventRow);
}
