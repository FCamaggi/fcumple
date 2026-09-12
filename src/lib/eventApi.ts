import { supabase } from './supabaseClient';
import type { EventConfig } from '../types';

interface EventConfigRow {
  id: boolean;
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  theme: string | null;
  rsvp_deadline: string | null;
  photos_revealed_at: string | null;
}

function mapRow(row: EventConfigRow): EventConfig {
  return {
    eventName: row.event_name,
    eventDate: row.event_date,
    location: row.location,
    theme: row.theme,
    rsvpDeadline: row.rsvp_deadline,
    photosRevealedAt: row.photos_revealed_at,
  };
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`No pudimos ${action}: ${error?.message ?? 'error desconocido'}`);
}

// `id` is deliberately not part of the public patch type — the row is a
// singleton pinned to `id: true` (see the migration) and callers must
// never be able to change it.
function toRow(patch: Partial<EventConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = { id: true };
  if (patch.eventName !== undefined) row.event_name = patch.eventName;
  if (patch.eventDate !== undefined) row.event_date = patch.eventDate;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.rsvpDeadline !== undefined) row.rsvp_deadline = patch.rsvpDeadline;
  if (patch.photosRevealedAt !== undefined) row.photos_revealed_at = patch.photosRevealedAt;
  return row;
}

export async function getEventConfig(): Promise<EventConfig | null> {
  const { data, error } = await supabase.from('event_config').select('*').maybeSingle();

  if (error) fail('cargar la configuración del evento', error);
  return data ? mapRow(data as unknown as EventConfigRow) : null;
}

export async function updateEventConfig(patch: Partial<EventConfig>): Promise<EventConfig> {
  const { data, error } = await supabase.from('event_config').upsert(toRow(patch)).select('*').single();

  if (error) fail('guardar la configuración del evento', error);
  return mapRow(data as unknown as EventConfigRow);
}

// "Revelar el rollo": acción de un solo sentido para el evento (no hay
// forma de volver a null desde el frontend a propósito, ver
// supabase/README.md § Revelado del rollo). Reusa updateEventConfig, que ya
// sabe hacer upsert de la fila singleton.
export function revealPhotos(): Promise<EventConfig> {
  return updateEventConfig({ photosRevealedAt: new Date().toISOString() });
}

// El hub público (/evento) solo puede mostrar un número, nunca nombres --
// get_public_headcount() es un RPC de solo lectura sin RLS de por medio que
// devuelve exactamente eso (ver supabase/migrations).
export async function getPublicHeadcount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_public_headcount');

  if (error) fail('cargar el número de confirmados', error);
  return data as number;
}
