import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from './supabaseClient';
import { getEventConfig, updateEventConfig } from './eventApi';

const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

const row = {
  id: true,
  event_name: 'NOCTURNA',
  event_date: '2026-05-24T02:00:00Z',
  location: 'The Warehouse Club',
  theme: 'All black',
  rsvp_deadline: '2026-05-21T23:59:00Z',
};

beforeEach(() => {
  from.mockReset();
});

describe('getEventConfig', () => {
  it('returns the row mapped to camelCase when it exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    from.mockReturnValue({ select });

    const config = await getEventConfig();

    expect(from).toHaveBeenCalledWith('event_config');
    expect(config).toEqual({
      eventName: 'NOCTURNA',
      eventDate: '2026-05-24T02:00:00Z',
      location: 'The Warehouse Club',
      theme: 'All black',
      rsvpDeadline: '2026-05-21T23:59:00Z',
    });
  });

  it('returns null when the table is empty', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    from.mockReturnValue({ select });

    const config = await getEventConfig();

    expect(config).toBeNull();
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    from.mockReturnValue({ select });

    await expect(getEventConfig()).rejects.toThrow(/network down/);
  });
});

describe('updateEventConfig', () => {
  it('upserts the singleton row pinning id to true regardless of the patch', async () => {
    const updatedRow = { ...row, event_name: 'RENOMBRADO' };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ upsert });

    const config = await updateEventConfig({
      eventName: 'RENOMBRADO',
      // @ts-expect-error id is not part of the public patch type
      id: false,
    });

    expect(from).toHaveBeenCalledWith('event_config');
    expect(upsert).toHaveBeenCalledWith({ id: true, event_name: 'RENOMBRADO' });
    expect(config.eventName).toBe('RENOMBRADO');
  });

  it('throws a readable error when supabase reports a failure', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ upsert });

    await expect(updateEventConfig({ eventName: 'X' })).rejects.toThrow(/permission denied/);
  });
});
