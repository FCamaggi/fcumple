import { supabase } from './supabaseClient';
import type { Guest, RsvpStatus } from '../types';

interface GuestRow {
  id: string;
  full_name: string;
  status: RsvpStatus;
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  responded_at: string | null;
}

function mapRow(row: GuestRow, token: string): Guest {
  return {
    id: row.id,
    token,
    fullName: row.full_name,
    status: row.status,
    plusOnesAllowed: row.plus_ones_allowed,
    plusOnesConfirmed: row.plus_ones_confirmed,
    guestNote: row.guest_note,
    respondedAt: row.responded_at,
  };
}

// `submit_rsvp` reports domain failures via a Postgres errcode (see
// supabase/README.md): 22023 for an invalid status/plus_ones, P0002 for a
// token that matches no guest. Anything else is treated as unexpected.
function translateRsvpError(error: { message?: string; code?: string }): Error {
  switch (error.code) {
    case '22023':
      return new Error('El número de acompañantes o el estado del RSVP no es válido.');
    case 'P0002':
      return new Error('Este enlace de invitación ya no es válido.');
    default:
      return new Error('No pudimos guardar tu respuesta. Intentá de nuevo en un momento.');
  }
}

export async function getGuestByToken(token: string): Promise<Guest | null> {
  const { data, error } = await supabase.rpc('get_guest_by_token', { p_token: token });

  if (error) {
    throw new Error(`No pudimos cargar tu invitación: ${error.message}`);
  }

  const row = data?.[0] as GuestRow | undefined;
  return row ? mapRow(row, token) : null;
}

export async function submitRsvp(
  token: string,
  status: 'confirmed' | 'declined',
  plusOnes: number,
  note?: string,
): Promise<Guest> {
  const { data, error } = await supabase.rpc('submit_rsvp', {
    p_token: token,
    p_status: status,
    p_plus_ones: plusOnes,
    p_note: note ?? null,
  });

  if (error) {
    throw translateRsvpError(error);
  }

  const row = data?.[0] as GuestRow | undefined;
  if (!row) {
    throw new Error('No pudimos guardar tu respuesta. Intentá de nuevo en un momento.');
  }
  return mapRow(row, token);
}
