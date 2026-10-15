import { supabase } from './supabaseClient';

/**
 * Capa de acceso de la Fase 1 (plataforma multi-tenant): evento público e
 * inscripción / inicio de sesión del invitado con el enlace único `/e/:slug`.
 * Habla con las RPC de supabase/fase-1/ (no con las de la Fase 0).
 *
 * El invitado se inscribe con su nombre y apellido y un PIN que elige él
 * mismo. No se pide ni se guarda ningún otro dato personal.
 */

export type AccessMode = 'open' | 'list' | 'list_requests';

export interface EventPublic {
  id: string;
  name: string;
  startsAt: string | null;
  location: string | null;
  rsvpDeadline: string | null;
  accessMode: AccessMode;
  cameraUnlock: 'on_identify' | 'on_checkin';
  rsvpEnabled: boolean;
  photosRevealed: boolean;
}

export type RegisterOutcome = 'ok' | 'pending_approval' | 'name_taken' | 'not_found' | 'ambiguous';
export type LoginOutcome = 'ok' | 'pending_approval' | 'invalid' | 'ambiguous' | 'locked' | 'needs_registration';

export interface AuthResult<O extends string> {
  outcome: O;
  guestToken: string | null;
  guestId: string | null;
  guestName: string | null;
}

export interface GuestSession {
  token: string;
  guestName: string;
}

export interface MyGuest {
  id: string;
  eventId: string;
  fullName: string;
  checkedInAt: string | null;
  photoQuota: number;
}

interface EventRow {
  id: string;
  name: string;
  starts_at: string | null;
  location: string | null;
  rsvp_deadline: string | null;
  access_mode: AccessMode;
  camera_unlock: 'on_identify' | 'on_checkin';
  rsvp_enabled: boolean;
  photos_revealed: boolean;
}

interface AuthRow<O extends string> {
  outcome: O;
  guest_token: string | null;
  guest_id: string | null;
  guest_name: string | null;
}

export async function getEventPublic(slug: string): Promise<EventPublic | null> {
  const { data, error } = await supabase.rpc('get_event_public', { p_slug: slug });
  if (error) {
    throw new Error('No pudimos cargar el evento. Intenta de nuevo en un momento.');
  }
  const row = (data as EventRow[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    startsAt: row.starts_at,
    location: row.location,
    rsvpDeadline: row.rsvp_deadline,
    accessMode: row.access_mode,
    cameraUnlock: row.camera_unlock,
    rsvpEnabled: row.rsvp_enabled,
    photosRevealed: row.photos_revealed,
  };
}

function mapAuth<O extends string>(row: AuthRow<O> | undefined): AuthResult<O> {
  if (!row) {
    throw new Error('No pudimos completar la operación. Intenta de nuevo en un momento.');
  }
  return {
    outcome: row.outcome,
    guestToken: row.guest_token,
    guestId: row.guest_id,
    guestName: row.guest_name,
  };
}

function authError(error: { code?: string; message?: string }): Error {
  switch (error.code) {
    case '22023':
      return new Error(
        /pin/i.test(error.message ?? '')
          ? 'El PIN debe tener entre 4 y 6 números.'
          : 'Escribe tu nombre y tu apellido.',
      );
    case '53400':
      return new Error(
        /limit reached/i.test(error.message ?? '')
          ? 'Este evento ya llegó al máximo de invitados.'
          : 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
      );
    case 'P0002':
      return new Error('Este evento no existe o el enlace está mal escrito.');
    default:
      return new Error('No pudimos completar la operación. Intenta de nuevo en un momento.');
  }
}

/** "Inscribirme": nombre y apellido + un PIN de 4 a 6 números que elige la persona. */
export async function registerGuest(slug: string, name: string, pin: string): Promise<AuthResult<RegisterOutcome>> {
  const { data, error } = await supabase.rpc('register_guest', { p_slug: slug, p_name: name, p_pin: pin });
  if (error) throw authError(error);
  return mapAuth((data as AuthRow<RegisterOutcome>[] | null)?.[0]);
}

/** "Ya me inscribí": nombre y PIN. */
export async function loginGuest(slug: string, name: string, pin: string): Promise<AuthResult<LoginOutcome>> {
  const { data, error } = await supabase.rpc('login_guest', { p_slug: slug, p_name: name, p_pin: pin });
  if (error) throw authError(error);
  return mapAuth((data as AuthRow<LoginOutcome>[] | null)?.[0]);
}

export async function getMyGuest(token: string): Promise<MyGuest | null> {
  const { data, error } = await supabase.rpc('get_guest_by_token', { p_token: token });
  if (error) {
    throw new Error('No pudimos cargar tu información. Intenta de nuevo en un momento.');
  }
  const row = (data as Array<{
    id: string;
    event_id: string;
    full_name: string;
    checked_in_at: string | null;
    photo_quota: number;
  }> | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    fullName: row.full_name,
    checkedInAt: row.checked_in_at,
    photoQuota: row.photo_quota,
  };
}

// --- Sesión del invitado en este dispositivo -----------------------------
// Solo el token y el nombre. NUNCA el PIN. El almacenamiento puede fallar o
// vaciarse (modo privado, Safari que limpia datos de sitios sin uso): en ese
// caso el invitado simplemente se identifica de nuevo.

const sessionKey = (slug: string) => `fcumple:session:${slug}`;

export function loadGuestSession(slug: string): GuestSession | null {
  try {
    const raw = window.localStorage.getItem(sessionKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestSession>;
    if (typeof parsed.token === 'string' && typeof parsed.guestName === 'string') {
      return { token: parsed.token, guestName: parsed.guestName };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGuestSession(slug: string, session: GuestSession): void {
  try {
    window.localStorage.setItem(sessionKey(slug), JSON.stringify(session));
  } catch {
    // Sin almacenamiento: la sesión vive solo mientras la pestaña esté abierta.
  }
}

export function clearGuestSession(slug: string): void {
  try {
    window.localStorage.removeItem(sessionKey(slug));
  } catch {
    // nada que limpiar
  }
}
