import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Guest } from '../types';

const createGuest = vi.fn();
const updateGuest = vi.fn();
vi.mock('../lib/adminApi', () => ({
  createGuest: (...args: unknown[]) => createGuest(...args),
  updateGuest: (...args: unknown[]) => updateGuest(...args),
}));

import ImportGuestsModal from './ImportGuestsModal';

beforeEach(() => {
  createGuest.mockReset();
  updateGuest.mockReset();
});

function textarea() {
  return screen.getByLabelText(/pegar csv/i) as HTMLTextAreaElement;
}

describe('ImportGuestsModal', () => {
  it('previews valid and invalid rows separately without creating anything', async () => {
    render(<ImportGuestsModal open guests={[]} onClose={() => {}} onImported={() => {}} onUpdated={() => {}} />);

    fireEvent.change(textarea(), {
      target: {
        value: ['full_name,plus_ones_allowed', 'Ana Torres,2', ',3', 'Beto Soto,not-a-number'].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 a crear · 0 a actualizar/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 error/i)).toBeInTheDocument();
    expect(createGuest).not.toHaveBeenCalled();
  });

  it('creates only the valid rows on confirm', async () => {
    createGuest.mockResolvedValue({
      id: 'new',
      fullName: 'Ana Torres',
      status: 'pending',
      plusOnesAllowed: 2,
      plusOnesConfirmed: 0,
      guestNote: null,
      respondedAt: null,
    });
    const onImported = vi.fn();

    render(<ImportGuestsModal open guests={[]} onClose={() => {}} onImported={onImported} onUpdated={() => {}} />);

    fireEvent.change(textarea(), {
      target: { value: ['full_name,plus_ones_allowed', 'Ana Torres,2', ',3'].join('\n') },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(createGuest).toHaveBeenCalledTimes(1);
    });
    expect(createGuest).toHaveBeenCalledWith({ fullName: 'Ana Torres', plusOnesAllowed: 2 });
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it('updates existing guests when a valid token is provided', async () => {
    updateGuest.mockResolvedValue({
      id: 'g1',
      token: 'tok_1',
      fullName: 'Ana Torres Actualizada',
      status: 'confirmed',
      plusOnesAllowed: 2,
      plusOnesConfirmed: 2,
      guestNote: 'Nueva nota',
      respondedAt: null,
    });
    const onUpdated = vi.fn();
    const guests: Guest[] = [
      {
        id: 'g1',
        token: 'tok_1',
        fullName: 'Ana Torres',
        status: 'pending',
        plusOnesAllowed: 2,
        plusOnesConfirmed: 0,
        guestNote: null,
        respondedAt: null,
        checkedInAt: null,
      },
    ];

    render(<ImportGuestsModal open guests={guests} onClose={() => {}} onImported={() => {}} onUpdated={onUpdated} />);

    fireEvent.change(textarea(), {
      target: {
        value: [
          'token,full_name,status,plus_ones_allowed,plus_ones_confirmed,guest_note',
          'tok_1,Ana Torres Actualizada,confirmed,2,2,Nueva nota',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(updateGuest).toHaveBeenCalledTimes(1);
    });
    expect(updateGuest).toHaveBeenCalledWith('g1', {
      fullName: 'Ana Torres Actualizada',
      status: 'confirmed',
      plusOnesAllowed: 2,
      plusOnesConfirmed: 2,
      guestNote: 'Nueva nota',
    });
    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
  });

  it('treats an unknown token as an error instead of creating a new guest', async () => {
    render(<ImportGuestsModal open guests={[]} onClose={() => {}} onImported={() => {}} onUpdated={() => {}} />);

    fireEvent.change(textarea(), {
      target: {
        value: ['token,full_name,plus_ones_allowed', 'tok_missing,Ana Torres,2'].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));

    await waitFor(() => {
      expect(screen.getByText(/0 a crear · 0 a actualizar/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/token no encontrado/i)).toBeInTheDocument();
  });

  it('passes the optional phone column through to createGuest when present', async () => {
    createGuest.mockResolvedValue({
      id: 'new',
      fullName: 'Ana Torres',
      status: 'pending',
      plusOnesAllowed: 2,
      plusOnesConfirmed: 0,
      guestNote: null,
      respondedAt: null,
    });

    render(<ImportGuestsModal open guests={[]} onClose={() => {}} onImported={() => {}} onUpdated={() => {}} />);

    fireEvent.change(textarea(), {
      target: { value: ['full_name,plus_ones_allowed,phone', 'Ana Torres,2,+56 9 1234 5678'].join('\n') },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(createGuest).toHaveBeenCalledWith({
        fullName: 'Ana Torres',
        plusOnesAllowed: 2,
        phone: '+56 9 1234 5678',
      });
    });
  });

  it('does not let a createGuest failure cancel the remaining rows', async () => {
    createGuest
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        id: 'new2',
        fullName: 'Beto Soto',
        status: 'pending',
        plusOnesAllowed: 0,
        plusOnesConfirmed: 0,
        guestNote: null,
        respondedAt: null,
      });

    render(<ImportGuestsModal open guests={[]} onClose={() => {}} onImported={() => {}} onUpdated={() => {}} />);

    fireEvent.change(textarea(), {
      target: { value: ['full_name,plus_ones_allowed', 'Ana Torres,2', 'Beto Soto,0'].join('\n') },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));
    await waitFor(() => screen.getByRole('button', { name: /confirmar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(createGuest).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText(/1 creado/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1 fall/i)).toBeInTheDocument();
  });
});
