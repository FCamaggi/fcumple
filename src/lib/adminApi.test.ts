import { describe, expect, it, vi, beforeEach } from 'vitest';

const from = vi.fn();
const rpc = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => from(...args), rpc: (...args: unknown[]) => rpc(...args) },
}));

import { listGuests, createGuest, updateGuest, deleteGuest, checkInGuest } from './adminApi';

const row = {
  id: 'g1',
  token: 'mafe-8842',
  full_name: 'Maria Fernanda Contreras',
  status: 'confirmed',
  plus_ones_allowed: 3,
  plus_ones_confirmed: 2,
  guest_note: 'hola',
  admin_note: 'nota interna',
  responded_at: '2026-05-20T00:00:00Z',
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
  checked_in_at: null,
};

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order'];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
});

describe('listGuests', () => {
  it('selects the explicit column set including admin_note', async () => {
    const builder = chain({ data: [row], error: null });
    from.mockReturnValue(builder);

    const guests = await listGuests();

    expect(from).toHaveBeenCalledWith('guests');
    expect(builder.select).toHaveBeenCalledTimes(1);
    const [selected] = (builder.select as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(selected).not.toMatch(/\*/);
    expect(selected).toMatch(/admin_note/);
    expect(guests).toEqual([
      {
        id: 'g1',
        token: 'mafe-8842',
        fullName: 'Maria Fernanda Contreras',
        status: 'confirmed',
        plusOnesAllowed: 3,
        plusOnesConfirmed: 2,
        guestNote: 'hola',
        adminNote: 'nota interna',
        respondedAt: '2026-05-20T00:00:00Z',
        createdAt: '2026-05-20T00:00:00Z',
        updatedAt: '2026-05-20T00:00:00Z',
        checkedInAt: null,
      },
    ]);
  });

  it('throws a readable error on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }));
    await expect(listGuests()).rejects.toThrow(/denied/);
  });
});

describe('createGuest', () => {
  it('inserts only the allowed fields', async () => {
    const builder = chain({ data: row, error: null });
    from.mockReturnValue(builder);

    const guest = await createGuest({ fullName: 'Nuevo Invitado', plusOnesAllowed: 2 });

    expect(builder.insert).toHaveBeenCalledWith({ full_name: 'Nuevo Invitado', plus_ones_allowed: 2 });
    expect(guest.fullName).toBe('Maria Fernanda Contreras');
  });
});

describe('updateGuest', () => {
  it('sends only whitelisted fields, never id or token', async () => {
    const builder = chain({ data: row, error: null });
    from.mockReturnValue(builder);

    await updateGuest('g1', {
      adminNote: 'actualizado',
      plusOnesAllowed: 4,
      status: 'declined',
      // @ts-expect-error id/token must not be assignable through patch
      id: 'hacked',
    });

    expect(builder.update).toHaveBeenCalledWith({
      admin_note: 'actualizado',
      plus_ones_allowed: 4,
      status: 'declined',
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'g1');
  });
});

describe('deleteGuest', () => {
  it('deletes by id', async () => {
    const builder = chain({ data: null, error: null });
    from.mockReturnValue(builder);

    await deleteGuest('g1');

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'g1');
  });

  it('throws a readable error on failure', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    await expect(deleteGuest('g1')).rejects.toThrow(/boom/);
  });
});

describe('checkInGuest', () => {
  const checkInRow = {
    id: 'g1',
    full_name: 'Maria Fernanda Contreras',
    status: 'confirmed',
    plus_ones_allowed: 3,
    plus_ones_confirmed: 2,
    guest_note: 'hola',
    responded_at: '2026-05-20T00:00:00Z',
    checked_in_at: '2026-05-20T23:15:00Z',
  };

  it('calls the check_in_guest RPC with the token and returns the mapped guest', async () => {
    rpc.mockResolvedValueOnce({ data: [checkInRow], error: null });

    const guest = await checkInGuest('mafe-8842');

    expect(rpc).toHaveBeenCalledWith('check_in_guest', { p_token: 'mafe-8842' });
    expect(guest).toEqual({
      id: 'g1',
      fullName: 'Maria Fernanda Contreras',
      status: 'confirmed',
      plusOnesAllowed: 3,
      plusOnesConfirmed: 2,
      guestNote: 'hola',
      respondedAt: '2026-05-20T00:00:00Z',
      checkedInAt: '2026-05-20T23:15:00Z',
    });
  });

  it('throws a readable error when the RPC reports a failure (e.g. unknown token)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'no guest matches this token', code: 'P0002' } });

    await expect(checkInGuest('no-existe')).rejects.toThrow(/no guest matches this token/);
  });
});
