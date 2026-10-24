import type { RawRevealedPhoto } from '../components/RevealedRoll';
import type { EventPublic } from './platformApi';
import type { OrganizerEvent } from './organizerApi';
import { SAMPLE_PHOTOS } from './samplePhotos';
import type { PhotoQuota, Post } from '../types';

/**
 * Lo que la organizadora ve en «Vista previa»: la pantalla del invitado en un teléfono, con el evento real, sus
 * avisos reales y datos de ejemplo para lo demás. Nada de esto toca RPC de invitado, tokens ni fotos reales, y
 * el código de activación del QR nunca sale de la organizadora (`toPublicPreviewEvent` lo deja fuera).
 */

export const PREVIEW_STATES = [
  { id: 'inscripcion', label: 'Inscripción' },
  { id: 'bloqueada', label: 'Cámara bloqueada' },
  { id: 'activa', label: 'Cámara activa' },
  { id: 'avisos', label: 'Avisos' },
  { id: 'fotos', label: 'Fotos publicadas' },
  { id: 'vacia', label: 'Cartelera vacía' },
  { id: 'agotado', label: 'Cupo agotado' },
] as const;

export type CatalogState = (typeof PREVIEW_STATES)[number]['id'];
/** `aviso` no está en el catálogo: lo usa el editor de avisos para mostrar el borrador. */
export type PreviewState = CatalogState | 'aviso';

const STATE_IDS: readonly string[] = [...PREVIEW_STATES.map((s) => s.id), 'aviso'];

/** Un aviso a medio escribir, tal como lo mostraría la cartelera. */
export interface PreviewDraftPost {
  /** Si edita un aviso que ya existe, su id: así no sale repetido. */
  id?: string;
  title: string;
  subtitle: string | null;
  body: string;
  coverImagePath: string | null;
  galleryPaths: string[];
}

export const PREVIEW_MESSAGE_TYPE = 'fcumple-preview';
/** Del marco al iframe: «los avisos cambiaron (se publicó o despublicó uno), vuelve a leerlos». No lleva datos. */
export const PREVIEW_REFRESH_TYPE = 'fcumple-preview-refresh';
/** Del iframe al marco: «ya escucho, mándame el estado». */
export const PREVIEW_READY_TYPE = 'fcumple-preview-ready';
/** Del iframe al marco: la nota que acompaña al estado que se ve. */
export const PREVIEW_NOTE_TYPE = 'fcumple-preview-note';

/** El estado de la dirección (`?estado=`); lo desconocido cae en «Cámara activa». */
export function parsePreviewState(raw: string | null): PreviewState {
  return raw !== null && STATE_IDS.includes(raw) ? (raw as PreviewState) : 'activa';
}

export function parsePreviewNote(data: unknown): { note: string | null } | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type !== PREVIEW_NOTE_TYPE) return null;
  if (m.note !== null && typeof m.note !== 'string') return null;
  return { note: m.note };
}

export interface PreviewMessage {
  type: typeof PREVIEW_MESSAGE_TYPE;
  state: PreviewState;
  draft: PreviewDraftPost | null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseDraft(raw: unknown): PreviewDraftPost | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const d = raw as Record<string, unknown>;
  if (typeof d.title !== 'string' || typeof d.body !== 'string') return undefined;
  if (d.subtitle !== null && typeof d.subtitle !== 'string') return undefined;
  if (d.coverImagePath !== null && typeof d.coverImagePath !== 'string') return undefined;
  if (!isStringArray(d.galleryPaths)) return undefined;
  const draft: PreviewDraftPost = {
    title: d.title,
    subtitle: d.subtitle,
    body: d.body,
    coverImagePath: d.coverImagePath,
    galleryPaths: d.galleryPaths,
  };
  if (typeof d.id === 'string') draft.id = d.id;
  return draft;
}

/** Valida lo que llega por `postMessage` (aunque sea del mismo origen): solo se aceptan formas conocidas. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.type !== PREVIEW_MESSAGE_TYPE) return null;
  if (typeof m.state !== 'string' || !STATE_IDS.includes(m.state)) return null;
  const draft = parseDraft(m.draft === undefined ? null : m.draft);
  if (draft === undefined) return null;
  return { type: PREVIEW_MESSAGE_TYPE, state: m.state as PreviewState, draft };
}

/**
 * El evento tal como lo recibe un invitado (`get_event_public`). Se arma campo por campo, sin esparcir el evento
 * de la organizadora, para que ningún dato suyo (como `activationCode`) se cuele por un campo nuevo.
 */
export function toPublicPreviewEvent(event: OrganizerEvent): EventPublic {
  return {
    id: event.id,
    name: event.name,
    startsAt: event.startsAt,
    location: event.location,
    rsvpDeadline: null,
    accessMode: event.accessMode,
    cameraUnlock: event.cameraUnlock,
    rsvpEnabled: event.rsvpEnabled,
    photosRevealed: event.photosRevealedAt !== null,
    enrollment: event.enrollment,
    subtitle: event.subtitle,
    theme: event.theme,
  };
}

export { SAMPLE_PHOTOS };

export interface PreviewScenario {
  screen: 'identify' | 'hub';
  guestFirstName: string;
  cameraUnlocked: boolean;
  quota: PhotoQuota | null;
  headcount: number | null;
  posts: Post[];
  revealed: RawRevealedPhoto[];
  /** Aviso para la organizadora sobre lo que es de ejemplo o falta. */
  note: string | null;
}

const SAMPLE_HEADCOUNT = 12;
const DRAFT_ID = 'borrador-vista-previa';

function draftToPost(draft: PreviewDraftPost, now: Date): Post {
  const iso = now.toISOString();
  return {
    id: draft.id ?? DRAFT_ID,
    title: draft.title.trim() === '' ? 'Título del aviso' : draft.title,
    subtitle: draft.subtitle && draft.subtitle.trim() !== '' ? draft.subtitle : null,
    body: draft.body.trim() === '' ? 'Aquí irá el texto del aviso.' : draft.body,
    coverImagePath: draft.coverImagePath,
    publishedAt: iso,
    createdAt: iso,
    // Siempre presente: así la cartelera no consulta `post_images` con el id de un borrador.
    galleryPaths: draft.galleryPaths,
  };
}

export function buildPreviewScenario(input: {
  state: PreviewState;
  event: OrganizerEvent;
  publishedPosts: Post[];
  draft: PreviewDraftPost | null;
  now: Date;
}): PreviewScenario {
  const { state, event, publishedPosts, draft, now } = input;
  const total = event.defaultPhotoQuota;
  const base: PreviewScenario = {
    screen: 'hub',
    guestFirstName: 'Ana',
    cameraUnlocked: true,
    quota: { quota: total, used: Math.min(2, Math.max(0, total - 1)) },
    headcount: SAMPLE_HEADCOUNT,
    posts: publishedPosts,
    revealed: [],
    note: null,
  };

  switch (state) {
    case 'inscripcion':
      return { ...base, screen: 'identify', cameraUnlocked: false, quota: null, headcount: null, posts: [] };
    case 'bloqueada':
      return { ...base, cameraUnlocked: false, quota: null };
    case 'activa':
      return base;
    case 'avisos':
      return {
        ...base,
        note: publishedPosts.length === 0 ? 'Todavía no has publicado avisos: así se ve la cartelera sin ellos.' : null,
      };
    case 'fotos':
      return { ...base, revealed: SAMPLE_PHOTOS, note: 'Las fotos son de ejemplo: aquí irán las que publiques.' };
    case 'vacia':
      return { ...base, headcount: null, posts: [], revealed: [] };
    case 'agotado':
      return { ...base, quota: { quota: total, used: total } };
    case 'aviso': {
      if (!draft) return base;
      const others = publishedPosts.filter((p) => p.id !== (draft.id ?? DRAFT_ID));
      return {
        ...base,
        posts: [draftToPost(draft, now), ...others],
        note: 'Así se vería tu aviso, publicado ahora, entre los que ya tienes.',
      };
    }
  }
}
