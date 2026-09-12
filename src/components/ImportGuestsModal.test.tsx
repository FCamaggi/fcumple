import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const createGuest = vi.fn();
vi.mock('../lib/adminApi', () => ({
  createGuest: (...args: unknown[]) => createGuest(...args),
}));

import ImportGuestsModal from './ImportGuestsModal';

beforeEach(() => {
  createGuest.mockReset();
});

function textarea() {
  return screen.getByLabelText(/pegar csv/i) as HTMLTextAreaElement;
}

describe('ImportGuestsModal', () => {
  it('previews valid and invalid rows separately without creating anything', async () => {
    render(<ImportGuestsModal open onClose={() => {}} onImported={() => {}} />);

    fireEvent.change(textarea(), {
      target: {
        value: ['full_name,plus_ones_allowed', 'Ana Torres,2', ',3', 'Beto Soto,not-a-number'].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 fila válida|1 válida/i)).toBeInTheDocument();
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

    render(<ImportGuestsModal open onClose={() => {}} onImported={onImported} />);

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

    render(<ImportGuestsModal open onClose={() => {}} onImported={() => {}} />);

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
