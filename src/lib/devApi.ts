import { supabase } from './supabaseClient';
import type { Guest, RsvpStatus } from '../types';

// Backstage/testing helpers for the DEV_GUEST_TOKEN guest (see
// src/lib/devGuest.ts and src/components/DevPanel.tsx). Deliberately calls
// `supabase.rpc` directly instead of importing anything from
// `src/lib/adminApi.ts` -- that module is only meant to be reachable from
// the lazy `/admin` chunk (see src/App.tsx), and importing it here would
// pull it (and everything else /admin needs) into the public guest bundle
// that every real invitee downloads.

interface DevGuestRow {
  id: string;
  full_name: string;
  status: RsvpStatus;
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  responded_at: string | null;
  checked_in_at: string | null;
}

function mapRow(row: DevGuestRow): Guest {
  return {
    id: row.id,
    fullName: row.full_name,
    status: row.status,
    plusOnesAllowed: row.plus_ones_allowed,
    plusOnesConfirmed: row.plus_ones_confirmed,
    guestNote: row.guest_note,
    respondedAt: row.responded_at,
    checkedInAt: row.checked_in_at,
  };
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`No pudimos ${action}: ${error?.message ?? 'error desconocido'}`);
}

// check_in_guest() ya es una RPC pública existente (la usa el escáner del
// admin, ver adminApi.ts) -- acá se llama directo para simular, desde el
// propio invitado dev, el escaneo que en producción hace la puerta.
export async function devCheckIn(token: string): Promise<Guest> {
  const { data, error } = await supabase.rpc('check_in_guest', { p_token: token });
  if (error) fail('registrar el check-in de prueba', error);

  const row = (data as unknown as DevGuestRow[])?.[0];
  if (!row) fail('registrar el check-in de prueba', { message: 'no se encontró la fila' });
  return mapRow(row);
}

// dev_reset_guest() es una RPC nueva (supabase/) que devuelve al invitado
// dev a `pending`, borra sus fotos y quita el check-in -- para poder
// recorrer todo el flujo de nuevo sin ensuciar datos reales.
export async function devResetGuest(token: string): Promise<Guest> {
  const { data, error } = await supabase.rpc('dev_reset_guest', { p_token: token });
  if (error) fail('reiniciar el invitado de prueba', error);

  const row = (data as unknown as DevGuestRow[])?.[0];
  if (!row) fail('reiniciar el invitado de prueba', { message: 'no se encontró la fila' });
  return mapRow(row);
}
