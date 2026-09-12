import { supabase } from './supabaseClient';
import type { Guest, RsvpStatus } from '../types';

const GUEST_COLUMNS =
  'id, token, full_name, status, plus_ones_allowed, plus_ones_confirmed, guest_note, admin_note, responded_at, created_at, updated_at, checked_in_at';

interface GuestRow {
  id: string;
  token: string;
  full_name: string;
  status: RsvpStatus;
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  admin_note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  checked_in_at: string | null;
}

function mapRow(row: GuestRow): Guest {
  return {
    id: row.id,
    token: row.token,
    fullName: row.full_name,
    status: row.status,
    plusOnesAllowed: row.plus_ones_allowed,
    plusOnesConfirmed: row.plus_ones_confirmed,
    guestNote: row.guest_note,
    adminNote: row.admin_note,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkedInAt: row.checked_in_at,
  };
}

function fail(action: string, error: { message?: string } | null): never {
  throw new Error(`No pudimos ${action}: ${error?.message ?? 'error desconocido'}`);
}

export async function listGuests(): Promise<Guest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select(GUEST_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) fail('cargar la lista de invitados', error);
  return ((data ?? []) as unknown as GuestRow[]).map(mapRow);
}

export interface CreateGuestInput {
  fullName: string;
  plusOnesAllowed: number;
}

export async function createGuest(input: CreateGuestInput): Promise<Guest> {
  const { data, error } = await supabase
    .from('guests')
    .insert({ full_name: input.fullName, plus_ones_allowed: input.plusOnesAllowed })
    .select(GUEST_COLUMNS)
    .single();

  if (error) fail('crear el invitado', error);
  return mapRow(data as unknown as GuestRow);
}

export interface UpdateGuestPatch {
  fullName?: string;
  status?: RsvpStatus;
  plusOnesAllowed?: number;
  plusOnesConfirmed?: number;
  guestNote?: string | null;
  adminNote?: string | null;
}

// Explicit allowlist: `id` and `token` (and anything else not listed here)
// can never be written through this function, no matter what a caller
// passes in `patch`.
function toRow(patch: UpdateGuestPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.plusOnesAllowed !== undefined) row.plus_ones_allowed = patch.plusOnesAllowed;
  if (patch.plusOnesConfirmed !== undefined) row.plus_ones_confirmed = patch.plusOnesConfirmed;
  if (patch.guestNote !== undefined) row.guest_note = patch.guestNote;
  if (patch.adminNote !== undefined) row.admin_note = patch.adminNote;
  return row;
}

export async function updateGuest(id: string, patch: UpdateGuestPatch): Promise<Guest> {
  const { data, error } = await supabase
    .from('guests')
    .update(toRow(patch))
    .eq('id', id)
    .select(GUEST_COLUMNS)
    .single();

  if (error) fail('actualizar el invitado', error);
  return mapRow(data as unknown as GuestRow);
}

export async function deleteGuest(id: string): Promise<void> {
  const { error } = await supabase.from('guests').delete().eq('id', id);
  if (error) fail('eliminar el invitado', error);
}

interface CheckInRow {
  id: string;
  full_name: string;
  status: RsvpStatus;
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  responded_at: string | null;
  checked_in_at: string | null;
}

function mapCheckInRow(row: CheckInRow): Guest {
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

// check_in_guest() is the door scanner's only entry point (see
// supabase/README.md). It never rejects an already-checked-in guest: it
// simply returns the row unchanged with its original checked_in_at, so the
// caller can tell "first arrival" from "already here" by comparing that
// value, not by catching an error. A token matching no guest throws.
export async function checkInGuest(token: string): Promise<Guest> {
  const { data, error } = await supabase.rpc('check_in_guest', { p_token: token });

  if (error) fail('registrar el check-in', error);

  const row = (data as unknown as CheckInRow[])?.[0];
  if (!row) fail('registrar el check-in', { message: 'no se encontró la fila' });
  return mapCheckInRow(row);
}
