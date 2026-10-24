import { describe, expect, it } from 'vitest';
import {
  PREVIEW_STATES,
  SAMPLE_PHOTOS,
  buildPreviewScenario,
  parsePreviewMessage,
  toPublicPreviewEvent,
  type PreviewDraftPost,
} from './guestPreview';
import type { OrganizerEvent } from './organizerApi';
import type { Post } from '../types';

const SECRET = 'SECRETO-DEL-QR-1234';
const NOW = new Date('2026-10-30T21:00:00Z');

const event = {
  id: 'ev-1',
  slug: 'puti-halloween',
  name: 'PUTI HALLOWEEN',
  startsAt: '2026-10-30T23:00:00Z',
  location: 'Casa de Fran',
  accessMode: 'open',
  cameraUnlock: 'on_event_qr',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: 'Cumpleaños Fran',
  theme: { preset: 'rosa-chicle' },
  activationCode: SECRET,
  defaultPhotoQuota: 5,
  enrollment: { plusOnes: false, comment: false, questions: [], welcome: '' },
  createdAt: '2026-10-01T00:00:00Z',
} as unknown as OrganizerEvent;

function post(id: string, publishedAt: string | null): Post {
  return { id, title: `Aviso ${id}`, subtitle: null, body: 'Cuerpo', coverImagePath: null, publishedAt, createdAt: '2026-10-20T00:00:00Z' };
}

const published = [post('a', '2026-10-25T12:00:00Z'), post('b', '2026-10-26T12:00:00Z')];

function scenario(state: Parameters<typeof buildPreviewScenario>[0]['state'], draft: PreviewDraftPost | null = null, posts = published) {
  return buildPreviewScenario({ state, event, publishedPosts: posts, draft, now: NOW });
}

describe('toPublicPreviewEvent', () => {
  it('copia lo que ve el invitado y nunca el código de activación', () => {
    const pub = toPublicPreviewEvent(event);

    expect(pub).toMatchObject({
      id: 'ev-1',
      name: 'PUTI HALLOWEEN',
      subtitle: 'Cumpleaños Fran',
      cameraUnlock: 'on_event_qr',
      theme: { preset: 'rosa-chicle' },
      photosRevealed: false,
    });
    expect(JSON.stringify(pub)).not.toContain(SECRET);
    expect(Object.keys(pub)).not.toContain('activationCode');
  });

  it('marca las fotos como reveladas cuando la organizadora ya las reveló', () => {
    expect(toPublicPreviewEvent({ ...event, photosRevealedAt: '2026-10-31T01:00:00Z' }).photosRevealed).toBe(true);
  });
});

describe('PREVIEW_STATES', () => {
  it('ofrece los siete estados de C1, cada uno con su nombre', () => {
    expect(PREVIEW_STATES.map((s) => s.id)).toEqual([
      'inscripcion',
      'bloqueada',
      'activa',
      'avisos',
      'fotos',
      'vacia',
      'agotado',
    ]);
    for (const s of PREVIEW_STATES) expect(s.label.length).toBeGreaterThan(0);
  });
});

describe('buildPreviewScenario', () => {
  it('la inscripción no muestra el hub', () => {
    expect(scenario('inscripcion').screen).toBe('identify');
  });

  it('con la cámara bloqueada no hay cupo y se ven los avisos actuales', () => {
    const s = scenario('bloqueada');
    expect(s.screen).toBe('hub');
    expect(s.cameraUnlocked).toBe(false);
    expect(s.quota).toBeNull();
    expect(s.posts.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('con la cámara activa el cupo es el del evento y queda al menos un disparo', () => {
    const s = scenario('activa');
    expect(s.cameraUnlocked).toBe(true);
    expect(s.quota).toEqual({ quota: 5, used: 2 });
  });

  it('con un cupo de un solo disparo no se gasta ninguno en el ejemplo', () => {
    const s = buildPreviewScenario({ state: 'activa', event: { ...event, defaultPhotoQuota: 1 }, publishedPosts: [], draft: null, now: NOW });
    expect(s.quota).toEqual({ quota: 1, used: 0 });
  });

  it('con el cupo agotado se usaron todos los disparos', () => {
    expect(scenario('agotado').quota).toEqual({ quota: 5, used: 5 });
  });

  it('las fotos publicadas son de ejemplo, ninguna sale del almacenamiento y se avisa', () => {
    const s = scenario('fotos');
    expect(s.revealed).toEqual(SAMPLE_PHOTOS);
    expect(s.revealed.length).toBeGreaterThan(1);
    expect(s.revealed.length).toBeLessThanOrEqual(10);
    expect(s.revealed.every((p) => p.storagePath.startsWith('data:image/'))).toBe(true);
    expect(s.note).toMatch(/ejemplo/i);
  });

  it('la cartelera vacía no trae avisos, fotos ni aforo', () => {
    const s = scenario('vacia');
    expect(s.posts).toEqual([]);
    expect(s.revealed).toEqual([]);
    expect(s.headcount).toBeNull();
  });

  it('si no hay avisos publicados lo dice en la nota del estado de avisos', () => {
    const s = scenario('avisos', null, []);
    expect(s.posts).toEqual([]);
    expect(s.note).toMatch(/no has publicado/i);
  });

  it('el invitado de ejemplo no es real: sin token y con nombre inventado', () => {
    const s = scenario('activa');
    expect(s.guestFirstName).toBe('Ana');
    expect(JSON.stringify(s)).not.toContain(SECRET);
    expect(JSON.stringify(s)).not.toMatch(/token/i);
  });

  it('el aviso en borrador va arriba, publicado ahora, con la galería ya resuelta y sin repetir el que se edita', () => {
    const draft: PreviewDraftPost = {
      id: 'a',
      title: 'Cambio de hora',
      subtitle: 'Ojo',
      body: 'Abrimos a las 22:00',
      coverImagePath: 'ev-1/portada.jpg',
      galleryPaths: ['ev-1/g1.jpg'],
    };
    const s = scenario('aviso', draft);

    expect(s.posts.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.posts[0]).toMatchObject({
      title: 'Cambio de hora',
      subtitle: 'Ojo',
      coverImagePath: 'ev-1/portada.jpg',
      galleryPaths: ['ev-1/g1.jpg'],
      publishedAt: NOW.toISOString(),
    });
    expect(s.posts.filter((p) => p.id === 'a')).toHaveLength(1);
  });

  it('un aviso nuevo (sin id) se muestra con un id propio que no choca con los publicados', () => {
    const s = scenario('aviso', { title: 'Nuevo', subtitle: null, body: 'x', coverImagePath: null, galleryPaths: [] });

    expect(s.posts).toHaveLength(3);
    expect(s.posts[0].id).not.toBe('a');
    expect(s.posts[0].galleryPaths).toEqual([]);
  });

  it('un borrador vacío se ve con textos de relleno y no con un hueco', () => {
    const s = scenario('aviso', { title: '', subtitle: null, body: '', coverImagePath: null, galleryPaths: [] });

    expect(s.posts[0].title).toBe('Título del aviso');
    expect(s.posts[0].body).toBe('Aquí irá el texto del aviso.');
  });

  it('sin borrador, el estado de aviso muestra solo los publicados', () => {
    expect(scenario('aviso').posts.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('parsePreviewMessage', () => {
  it('acepta un estado conocido', () => {
    expect(parsePreviewMessage({ type: 'fcumple-preview', state: 'activa', draft: null })).toEqual({
      type: 'fcumple-preview',
      state: 'activa',
      draft: null,
    });
  });

  it('acepta un borrador bien formado y descarta campos de más', () => {
    const msg = parsePreviewMessage({
      type: 'fcumple-preview',
      state: 'aviso',
      draft: { title: 'T', subtitle: null, body: 'B', coverImagePath: null, galleryPaths: ['x.jpg'], extra: 'no' },
    });

    expect(msg?.draft).toEqual({ title: 'T', subtitle: null, body: 'B', coverImagePath: null, galleryPaths: ['x.jpg'] });
  });

  it.each([
    ['nada', undefined],
    ['un texto', 'hola'],
    ['otro tipo de mensaje', { type: 'otro', state: 'activa', draft: null }],
    ['un estado desconocido', { type: 'fcumple-preview', state: 'admin', draft: null }],
    ['un borrador con título que no es texto', { type: 'fcumple-preview', state: 'aviso', draft: { title: 1, subtitle: null, body: '', coverImagePath: null, galleryPaths: [] } }],
    ['una galería con algo que no es texto', { type: 'fcumple-preview', state: 'aviso', draft: { title: '', subtitle: null, body: '', coverImagePath: null, galleryPaths: [1] } }],
  ])('rechaza %s', (_name, data) => {
    expect(parsePreviewMessage(data)).toBeNull();
  });
});
