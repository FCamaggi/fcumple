import { supabase } from './supabaseClient';
import { sanitizeFrameParams, validateFrameParams, type FrameParams, type FrameTemplate } from './cameraAssets/frames';
import { isSingleEmoji, processStickerImage } from './cameraAssets/stickers';

/**
 * Capa de datos del "estudio de cámara" del organizador: marcos paramétricos y
 * stickers de SU evento. La RLS garantiza que solo toca lo suyo; los topes
 * (20 marcos, 40 stickers) los aplica la base de datos.
 */

export interface EventFrame {
  id: string;
  eventId: string;
  template: FrameTemplate;
  label: string;
  params: FrameParams;
  enabled: boolean;
  sortOrder: number;
}

export interface EventSticker {
  id: string;
  eventId: string;
  kind: 'emoji' | 'image';
  emoji: string | null;
  storagePath: string | null;
  enabled: boolean;
  sortOrder: number;
}

interface FrameRow {
  id: string;
  event_id: string;
  template: FrameTemplate;
  label: string;
  params: unknown;
  enabled: boolean;
  sort_order: number;
}

interface StickerRow {
  id: string;
  event_id: string;
  kind: 'emoji' | 'image';
  emoji: string | null;
  storage_path: string | null;
  enabled: boolean;
  sort_order: number;
}

const BUCKET = 'event-assets';

const mapFrame = (row: FrameRow): EventFrame => ({
  id: row.id,
  eventId: row.event_id,
  template: row.template,
  label: row.label,
  params: sanitizeFrameParams(row.params),
  enabled: row.enabled,
  sortOrder: row.sort_order,
});

const mapSticker = (row: StickerRow): EventSticker => ({
  id: row.id,
  eventId: row.event_id,
  kind: row.kind,
  emoji: row.emoji,
  storagePath: row.storage_path,
  enabled: row.enabled,
  sortOrder: row.sort_order,
});

function assetError(error: { code?: string }, what: 'marco' | 'sticker'): Error {
  if (error.code === '53400') {
    return new Error(
      what === 'marco' ? 'Llegaste al máximo de 20 marcos por evento.' : 'Llegaste al máximo de 40 stickers por evento.',
    );
  }
  if (error.code === '42501') return new Error('No tienes permiso para modificar este evento.');
  if (error.code === '23514') return new Error(`Los datos del ${what} no son válidos.`);
  return new Error(`No pudimos guardar el ${what}. Intenta de nuevo en un momento.`);
}

// --- Marcos -------------------------------------------------------------------

export async function listFrames(eventId: string): Promise<EventFrame[]> {
  const { data, error } = await supabase
    .from('event_frames')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error('No pudimos cargar los marcos.');
  return ((data ?? []) as FrameRow[]).map(mapFrame);
}

export interface FrameInput {
  template: FrameTemplate;
  label: string;
  params: FrameParams;
}

export async function createFrame(eventId: string, input: FrameInput, sortOrder = 0): Promise<EventFrame> {
  const valid = validateFrameParams(input.params);
  if (!valid.ok) throw new Error(valid.error);
  const label = input.label.trim();
  if (!label) throw new Error('Ponle un nombre al marco.');

  const { data, error } = await supabase
    .from('event_frames')
    .insert({ event_id: eventId, template: input.template, label, params: input.params, sort_order: sortOrder })
    .select('*')
    .single();
  if (error) throw assetError(error, 'marco');
  return mapFrame(data as FrameRow);
}

export interface FramePatch {
  label?: string;
  params?: FrameParams;
  enabled?: boolean;
}

export async function updateFrame(frameId: string, patch: FramePatch): Promise<EventFrame> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) throw new Error('Ponle un nombre al marco.');
    row.label = patch.label.trim();
  }
  if (patch.params !== undefined) {
    const valid = validateFrameParams(patch.params);
    if (!valid.ok) throw new Error(valid.error);
    row.params = patch.params;
  }
  if (patch.enabled !== undefined) row.enabled = patch.enabled;

  const { data, error } = await supabase.from('event_frames').update(row).eq('id', frameId).select('*').single();
  if (error) throw assetError(error, 'marco');
  return mapFrame(data as FrameRow);
}

export async function deleteFrame(frameId: string): Promise<void> {
  const { error } = await supabase.from('event_frames').delete().eq('id', frameId);
  if (error) throw assetError(error, 'marco');
}

/** Guarda el orden de la lista: `sort_order` pasa a ser la posición de cada id. */
export async function reorderFrames(orderedIds: string[]): Promise<void> {
  for (const [position, id] of orderedIds.entries()) {
    const { error } = await supabase.from('event_frames').update({ sort_order: position }).eq('id', id);
    if (error) throw assetError(error, 'marco');
  }
}

// --- Stickers -----------------------------------------------------------------

export async function listStickers(eventId: string): Promise<EventSticker[]> {
  const { data, error } = await supabase
    .from('event_stickers')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error('No pudimos cargar los stickers.');
  return ((data ?? []) as StickerRow[]).map(mapSticker);
}

export async function addEmojiSticker(eventId: string, emoji: string, sortOrder = 0): Promise<EventSticker> {
  const value = emoji.trim();
  if (!isSingleEmoji(value)) throw new Error('Escribe o pega un solo emoji.');

  const { data, error } = await supabase
    .from('event_stickers')
    .insert({ event_id: eventId, kind: 'emoji', emoji: value, sort_order: sortOrder })
    .select('*')
    .single();
  if (error) throw assetError(error, 'sticker');
  return mapSticker(data as StickerRow);
}

/** Procesa la imagen (512 px, WebP, < 300 KB), la sube a `{event_id}/stickers/` y crea el sticker. */
export async function addImageSticker(eventId: string, file: File, sortOrder = 0): Promise<EventSticker> {
  const blob = await processStickerImage(file);
  const extension = blob.type === 'image/webp' ? 'webp' : 'png';
  const path = `${eventId}/stickers/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
  if (uploadError) throw new Error('No pudimos subir la imagen. Intenta de nuevo.');

  const { data, error } = await supabase
    .from('event_stickers')
    .insert({ event_id: eventId, kind: 'image', storage_path: path, sort_order: sortOrder })
    .select('*')
    .single();
  if (error) {
    // No dejar el archivo huérfano si la fila no se pudo crear.
    await supabase.storage.from(BUCKET).remove([path]);
    throw assetError(error, 'sticker');
  }
  return mapSticker(data as StickerRow);
}

export async function setStickerEnabled(stickerId: string, enabled: boolean): Promise<EventSticker> {
  const { data, error } = await supabase
    .from('event_stickers')
    .update({ enabled })
    .eq('id', stickerId)
    .select('*')
    .single();
  if (error) throw assetError(error, 'sticker');
  return mapSticker(data as StickerRow);
}

export async function deleteSticker(sticker: Pick<EventSticker, 'id' | 'storagePath'>): Promise<void> {
  const { error } = await supabase.from('event_stickers').delete().eq('id', sticker.id);
  if (error) throw assetError(error, 'sticker');
  if (sticker.storagePath) {
    // Mejor esfuerzo: si el archivo no se puede borrar, la fila ya no existe.
    await supabase.storage.from(BUCKET).remove([sticker.storagePath]);
  }
}

/** URL firmada para mostrar la imagen de un sticker en el panel del organizador. */
export async function getStickerPreviewUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  return error || !data ? null : data.signedUrl;
}
