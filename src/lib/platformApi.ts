import { supabase } from './supabaseClient';

/**
 * Capa de acceso de la Fase 1 (plataforma multi-tenant): evento público e
 * identificación del invitado con el enlace único `/e/:slug`. Habla con las
 * RPC de supabase/fase-1/ (no con las de la Fase 0).
 */

export type AccessMode = 'list' | 'list_requests' | 'open';
export type Identifier = 'name' | 'rut_lookup';

export interface EventPublic {
  id: string;
  name: string;
  startsAt: string | null;
  location: string | null;
  rsvpDeadline: string | null;
  accessMode: AccessMode;
  identifier: Identifier;
  cameraUnlock: 'on_identify' | 'on_checkin';
  rsvpEnabled: boolean;
  photosRevealed: boolean;
}

export type IdentifyOutcome = 'ok' | 'ambiguous' | 'not_found' | 'pending_approval';

export interface IdentifyResult {
  outcome: IdentifyOutcome;
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
  identifier: Identifier;
  camera_unlock: 'on_identify' | 'on_checkin';
  rsvp_enabled: boolean;
  photos_revealed: boolean;
}

interface IdentifyRow {
  outcome: IdentifyOutcome;
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
    identifier: row.identifier,
    cameraUnlock: row.camera_unlock,
    rsvpEnabled: row.rsvp_enabled,
    photosRevealed: row.photos_revealed,
  };
}

function mapIdentify(row: IdentifyRow | undefined): IdentifyResult {
  if (!row) {
    throw new Error('No pudimos identificarte. Intenta de nuevo en un momento.');
  }
  return {
    outcome: row.outcome,
    guestToken: row.guest_token,
    guestId: row.guest_id,
    guestName: row.guest_name,
  };
}

const TOO_MANY_ATTEMPTS = 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';

/** Identificación por nombre y apellido (`identify_guest`). */
export async function identifyByName(slug: string, name: string): Promise<IdentifyResult> {
  const { data, error } = await supabase.rpc('identify_guest', { p_slug: slug, p_name: name });

  if (error) {
    switch (error.code) {
      case '22023':
        throw new Error('Escribe tu nombre y tu apellido.');
      case '53400':
        throw new Error(TOO_MANY_ATTEMPTS);
      case 'P0002':
        throw new Error('Este evento no existe o el enlace está mal escrito.');
      case '42501':
        throw new Error('Este evento te identifica con tu RUT.');
      default:
        throw new Error('No pudimos identificarte. Intenta de nuevo en un momento.');
    }
  }

  return mapIdentify((data as IdentifyRow[] | null)?.[0]);
}

/**
 * Identificación por RUT: el RUT viaja a la función serverless `/api/identify`,
 * que lo resuelve con un proveedor externo y NO lo guarda. Aquí tampoco se
 * guarda: ni en estado persistente, ni en almacenamiento, ni en logs.
 */
export async function identifyByRut(slug: string, rut: string): Promise<IdentifyResult> {
  let response: Response;
  try {
    response = await fetch('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, rut }),
    });
  } catch {
    throw new Error('No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.');
  }

  const payload = (await response.json().catch(() => null)) as (Partial<IdentifyRow> & { error?: string }) | null;

  if (!response.ok) {
    switch (response.status) {
      case 400:
        throw new Error('Revisa tu RUT: parece que hay un error de tipeo.');
      case 404:
        throw new Error('Este evento no existe o el enlace está mal escrito.');
      case 429:
        throw new Error(TOO_MANY_ATTEMPTS);
      case 501:
        throw new Error('La verificación por RUT todavía no está disponible para este evento.');
      default:
        throw new Error('No pudimos identificarte. Intenta de nuevo en un momento.');
    }
  }

  return mapIdentify(payload as IdentifyRow | undefined);
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
// Solo el token y el nombre. NUNCA el RUT. El almacenamiento puede fallar o
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
