import { supabase } from './supabaseClient';
import type { EventConfig } from '../types';

interface EventConfigRow {
  id: boolean;
  event_name: string | null;
  event_date: string | null;
  location: string | null;
  theme: string | null;
  rsvp_deadline: string | null;
}

function mapRow(row: EventConfigRow): EventConfig {
  return {
    eventName: row.event_name,
    eventDate: row.event_date,
    location: row.location,
    theme: row.theme,
    rsvpDeadline: row.rsvp_deadline,
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
