import { beforeEach, describe, expect, it, vi } from 'vitest';

// Constructor de consultas simulado: cada método devuelve el mismo objeto, y
// al hacer `await` se resuelve con el resultado configurado.
function chain(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return { proxy, calls };
}

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { supabase } from './supabaseClient';
import {
  addGuest,
  addGuests,
  createEvent,
  getMyEvent,
  listEventGuests,
  listEventPhotos,
  moderateEventPhoto,
  publishPhotoBatch,
  rotateActivationCode,
  listMyEvents,
  regenerateGuestToken,
  removeGuest,
  setGuestApproval,
  setGuestPlusOnes,
  updateEvent,
} from './organizerApi';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const eventRow = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
  starts_at: null,
  location: 'Casa',
  access_mode: 'list',
  camera_unlock: 'on_identify',
  rsvp_enabled: false,
  frames_enabled: true,
  stickers_enabled: true,
  default_frame_id: null,
  photos_revealed_at: null,
  default_photo_quota: 5,
  enrollment_config: {},
  subtitle: null,
  theme: {},
  activation_code: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  created_at: '2026-10-15T00:00:00Z',
};

const guestRow = {
  id: 'g1',
  event_id: 'ev-1',
  full_name: 'Ana Rojas',
  token: 'tok',
  approval_status: 'approved',
  status: 'pending',
  plus_ones_allowed: 0,
  plus_ones_confirmed: 0,
  photo_quota: 5,
  guest_answers: {},
  plus_ones_requested: 0,
  checked_in_at: null,
  claimed_at: null,
  last_seen_at: null,
};

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe('eventos', () => {
  it('listMyEvents mapea las filas', async () => {
    const q = chain({ data: [eventRow], error: null });
    from.mockReturnValueOnce(q.proxy);
    const events = await listMyEvents();
    expect(from).toHaveBeenCalledWith('events');
    expect(events[0]).toMatchObject({ id: 'ev-1', slug: 'fiesta-abcd', accessMode: 'list', cameraUnlock: 'on_identify' });
  });

  it('getMyEvent devuelve null si no existe o no es del organizador (RLS)', async () => {
    from.mockReturnValueOnce(chain({ data: null, error: null }).proxy);
    expect(await getMyEvent('x')).toBeNull();
  });

  it('createEvent usa la RPC create_event y devuelve el evento', async () => {
    rpc.mockResolvedValueOnce({ data: [eventRow], error: null });
    const ev = await createEvent({ name: 'Fiesta', location: 'Casa' });
    expect(rpc).toHaveBeenCalledWith('create_event', { p_name: 'Fiesta', p_starts_at: null, p_location: 'Casa' });
    expect(ev.slug).toBe('fiesta-abcd');
  });

  it('createEvent traduce el error de nombre vacío', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23514', message: 'x' } });
    await expect(createEvent({ name: '' })).rejects.toThrow(/nombre/);
  });

  it('createEvent explica el tope de eventos por cuenta', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '53400', message: 'event limit reached' } });
    await expect(createEvent({ name: 'Uno más' })).rejects.toThrow(/máximo de eventos/);
  });

  it('updateEvent envía los ajustes de cámara en snake_case', async () => {
    const q = chain({ data: eventRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await updateEvent('ev-1', { framesEnabled: false, stickersEnabled: true, defaultFrameId: 'f1' });
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({
      frames_enabled: false,
      stickers_enabled: true,
      default_frame_id: 'f1',
    });
  });

  it('updateEvent guarda la configuración de la inscripción y el cupo por defecto', async () => {
    const q = chain({ data: eventRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await updateEvent('ev-1', {
      defaultPhotoQuota: 10,
      startsAt: '2026-10-30T23:30:00.000Z',
      enrollment: {
        welcome: ' Hola ',
        plusOnes: { max: 1 },
        comment: null,
        questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
      },
    });
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({
      default_photo_quota: 10,
      starts_at: '2026-10-30T23:30:00.000Z',
      enrollment_config: {
        welcome: 'Hola',
        plus_ones: { max: 1 },
        questions: [{ id: 'q1', label: '¿De qué te disfrazas?', required: true }],
      },
    });
  });

  it('updateEvent explica cuando la base rechaza un valor', async () => {
    from.mockReturnValueOnce(chain({ data: null, error: { code: '23514' } }).proxy);
    await expect(updateEvent('ev-1', { defaultPhotoQuota: 500 })).rejects.toThrow(/no es válido/);
  });

  it('mapea la configuración de la inscripción y el cupo del evento', async () => {
    const q = chain({
      data: [{ ...eventRow, default_photo_quota: 10, enrollment_config: { plus_ones: { max: 2 } } }],
      error: null,
    });
    from.mockReturnValueOnce(q.proxy);
    const [event] = await listMyEvents();
    expect(event.defaultPhotoQuota).toBe(10);
    expect(event.enrollment.plusOnes).toEqual({ max: 2 });
  });

  it('updateEvent envía solo los campos indicados, en snake_case', async () => {
    const q = chain({ data: eventRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await updateEvent('ev-1', { accessMode: 'open', rsvpEnabled: true });
    const update = q.calls.find(([name]) => name === 'update');
    expect(update?.[1][0]).toEqual({ access_mode: 'open', rsvp_enabled: true });
    expect(q.calls.find(([name]) => name === 'eq')?.[1]).toEqual(['id', 'ev-1']);
  });
});

describe('invitados', () => {
  it('listEventGuests filtra por evento', async () => {
    const q = chain({ data: [guestRow], error: null });
    from.mockReturnValueOnce(q.proxy);
    const guests = await listEventGuests('ev-1');
    expect(q.calls.find(([name]) => name === 'eq')?.[1]).toEqual(['event_id', 'ev-1']);
    expect(guests[0]).toMatchObject({ fullName: 'Ana Rojas', approvalStatus: 'approved', token: 'tok' });
  });

  it('listEventGuests entrega las respuestas de la inscripción', async () => {
    const q = chain({
      data: [{ ...guestRow, guest_answers: { plus_ones: ['Luis Pérez'], q1: 'Regina' }, plus_ones_requested: 1 }],
      error: null,
    });
    from.mockReturnValueOnce(q.proxy);
    const [guest] = await listEventGuests('ev-1');
    expect(guest.answers).toEqual({ plus_ones: ['Luis Pérez'], q1: 'Regina' });
    expect(guest.plusOnesRequested).toBe(1);
  });

  it('addGuest inserta con el event_id', async () => {
    const q = chain({ data: guestRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await addGuest('ev-1', 'Ana Rojas');
    expect(q.calls.find(([name]) => name === 'insert')?.[1][0]).toEqual({ event_id: 'ev-1', full_name: 'Ana Rojas' });
  });

  it('addGuest usa el cupo del evento cuando se lo pasan', async () => {
    const q = chain({ data: guestRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await addGuest('ev-1', 'Ana Rojas', 10);
    expect(q.calls.find(([name]) => name === 'insert')?.[1][0]).toEqual({
      event_id: 'ev-1',
      full_name: 'Ana Rojas',
      photo_quota: 10,
    });
  });

  it.each([
    ['23514', /nombre y apellido/],
    ['23505', /segundo apellido/],
    ['42501', /permiso/],
    ['XX000', /No pudimos guardar/],
  ])('addGuest traduce el código %s', async (code, message) => {
    from.mockReturnValueOnce(chain({ data: null, error: { code } }).proxy);
    await expect(addGuest('ev-1', 'Ana')).rejects.toThrow(message);
  });

  it('addGuests sigue con el resto cuando alguno falla y reporta cuál', async () => {
    from
      .mockReturnValueOnce(chain({ data: guestRow, error: null }).proxy)
      .mockReturnValueOnce(chain({ data: null, error: { code: '23514' } }).proxy)
      .mockReturnValueOnce(chain({ data: { ...guestRow, id: 'g3', full_name: 'Beto Mora' }, error: null }).proxy);

    const result = await addGuests('ev-1', ['Ana Rojas', 'Madonna', 'Beto Mora']);

    expect(result.created.map((g) => g.fullName)).toEqual(['Ana Rojas', 'Beto Mora']);
    expect(result.failed).toEqual([{ name: 'Madonna', reason: expect.stringMatching(/nombre y apellido/) }]);
  });

  it('setGuestPlusOnes: aprobar sube el cupo y confirma lo solicitado', async () => {
    const q = chain({ data: { ...guestRow, plus_ones_requested: 2, plus_ones_allowed: 2, plus_ones_confirmed: 2 }, error: null });
    from.mockReturnValueOnce(q.proxy);
    const guest = {
      id: 'g1', eventId: 'ev-1', fullName: 'Ana Rojas', token: 't', approvalStatus: 'approved' as const,
      status: 'pending' as const, plusOnesAllowed: 0, plusOnesConfirmed: 0, photoQuota: 5, answers: {},
      plusOnesRequested: 2, checkedInAt: null, claimedAt: null, lastSeenAt: null,
    };
    const updated = await setGuestPlusOnes(guest, true);
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({ plus_ones_allowed: 2, plus_ones_confirmed: 2 });
    expect(updated.plusOnesConfirmed).toBe(2);
  });

  it('setGuestPlusOnes: aprobar no baja un cupo mayor que el invitado ya tenía', async () => {
    const q = chain({ data: guestRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await setGuestPlusOnes(
      {
        id: 'g1', eventId: 'ev-1', fullName: 'Ana Rojas', token: 't', approvalStatus: 'approved', status: 'pending',
        plusOnesAllowed: 4, plusOnesConfirmed: 0, photoQuota: 5, answers: {}, plusOnesRequested: 1,
        checkedInAt: null, claimedAt: null, lastSeenAt: null,
      },
      true,
    );
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({ plus_ones_allowed: 4, plus_ones_confirmed: 1 });
  });

  it('setGuestPlusOnes: no aprobar deja la solicitud en 0', async () => {
    const q = chain({ data: guestRow, error: null });
    from.mockReturnValueOnce(q.proxy);
    await setGuestPlusOnes(
      {
        id: 'g1', eventId: 'ev-1', fullName: 'Ana Rojas', token: 't', approvalStatus: 'approved', status: 'pending',
        plusOnesAllowed: 0, plusOnesConfirmed: 0, photoQuota: 5, answers: {}, plusOnesRequested: 2,
        checkedInAt: null, claimedAt: null, lastSeenAt: null,
      },
      false,
    );
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({ plus_ones_requested: 0 });
  });

  it('setGuestApproval actualiza approval_status', async () => {
    const q = chain({ data: { ...guestRow, approval_status: 'rejected' }, error: null });
    from.mockReturnValueOnce(q.proxy);
    const guest = await setGuestApproval('g1', 'rejected');
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({ approval_status: 'rejected' });
    expect(guest.approvalStatus).toBe('rejected');
  });

  it('removeGuest borra por id', async () => {
    const q = chain({ data: null, error: null });
    from.mockReturnValueOnce(q.proxy);
    await removeGuest('g1');
    expect(q.calls.find(([name]) => name === 'delete')).toBeTruthy();
    expect(q.calls.find(([name]) => name === 'eq')?.[1]).toEqual(['id', 'g1']);
  });

  it('regenerateGuestToken usa la RPC y devuelve el invitado con el token nuevo', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...guestRow, token: 'nuevo' }], error: null });
    const guest = await regenerateGuestToken('g1');
    expect(rpc).toHaveBeenCalledWith('regenerate_guest_token', { p_guest_id: 'g1' });
    expect(guest.token).toBe('nuevo');
  });
});

describe('fotos del evento', () => {
  it('listEventPhotos filtra por evento y trae el nombre de quien la tomó', async () => {
    const q = chain({
      data: [
        {
          id: 'p1',
          guest_id: 'g1',
          storage_path: 'ev-1/g1/a.jpg',
          display_storage_path: null,
          status: 'pending',
          created_at: '2026-10-15T00:00:00Z',
          guests: { full_name: 'Ana Rojas' },
        },
      ],
      error: null,
    });
    from.mockReturnValueOnce(q.proxy);
    const photos = await listEventPhotos('ev-1');
    expect(q.calls.find(([name]) => name === 'eq')?.[1]).toEqual(['event_id', 'ev-1']);
    expect(photos[0]).toMatchObject({ id: 'p1', status: 'pending', guestFullName: 'Ana Rojas' });
  });

  it('moderateEventPhoto actualiza el estado por id', async () => {
    const q = chain({ data: null, error: null });
    from.mockReturnValueOnce(q.proxy);
    await moderateEventPhoto('p1', 'rejected');
    expect(q.calls.find(([name]) => name === 'update')?.[1][0]).toEqual({ status: 'rejected' });
    expect(q.calls.find(([name]) => name === 'eq')?.[1]).toEqual(['id', 'p1']);
  });

  it('publishPhotoBatch publica el lote con la RPC y devuelve cuántas fotos fueron', async () => {
    rpc.mockResolvedValueOnce({ data: 7, error: null });
    await expect(publishPhotoBatch('ev-1')).resolves.toBe(7);
    expect(rpc).toHaveBeenCalledWith('publish_photo_batch', { p_event_id: 'ev-1' });
  });

  it('publishPhotoBatch explica los errores', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'x' } });
    await expect(publishPhotoBatch('ev-1')).rejects.toThrow(/Solo la dueña/);
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'x' } });
    await expect(publishPhotoBatch('ev-1')).rejects.toThrow(/No pudimos publicar/);
  });

  it('rotateActivationCode devuelve el código nuevo', async () => {
    rpc.mockResolvedValueOnce({ data: 'f'.repeat(32), error: null });
    await expect(rotateActivationCode('ev-1')).resolves.toBe('f'.repeat(32));
    expect(rpc).toHaveBeenCalledWith('rotate_activation_code', { p_event_id: 'ev-1' });
  });

  it('rotateActivationCode explica si falla', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'x' } });
    await expect(rotateActivationCode('ev-1')).rejects.toThrow(/No pudimos cambiar el código/);
  });

  it('listEventPhotos entrega cuándo se publicó cada foto', async () => {
    const q = chain({
      data: [{ id: 'p1', guest_id: 'g1', storage_path: 'a', display_storage_path: null, status: 'approved', created_at: 't', published_at: '2026-10-30T23:00:00Z', guests: { full_name: 'Ana Rojas' } }],
      error: null,
    });
    from.mockReturnValueOnce(q.proxy);
    const [p] = await listEventPhotos('ev-1');
    expect(p.publishedAt).toBe('2026-10-30T23:00:00Z');
  });
});
