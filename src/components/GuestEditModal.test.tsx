import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestEditModal from './GuestEditModal';
import type { Guest } from '../types';

const guest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'confirmed',
  plusOnesAllowed: 3,
  plusOnesConfirmed: 2,
  guestNote: null,
  adminNote: null,
  respondedAt: '2026-05-20T00:00:00Z',
  checkedInAt: null,
  photoQuota: 6,
};

describe('GuestEditModal', () => {
  it('muestra el cupo de fotos actual del invitado', () => {
    render(<GuestEditModal guest={guest} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);

    const quotaInput = screen.getByLabelText(/cupo de fotos/i) as HTMLInputElement;
    expect(quotaInput.value).toBe('6');
  });

  it('no recalcula el cupo de fotos al cambiar el cupo de acompañantes (invitado existente)', async () => {
    const user = userEvent.setup();
    render(<GuestEditModal guest={guest} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /aumentar cupo máximo/i }));

    const quotaInput = screen.getByLabelText(/cupo de fotos/i) as HTMLInputElement;
    expect(quotaInput.value).toBe('6');
  });

  it('permite editar el cupo de fotos y lo envía al guardar', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<GuestEditModal guest={guest} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()} />);

    const quotaInput = screen.getByLabelText(/cupo de fotos/i);
    await user.clear(quotaInput);
    await user.type(quotaInput, '9');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ photoQuota: 9 }));
  });

  it('muestra el teléfono actual del invitado', () => {
    render(
      <GuestEditModal guest={{ ...guest, phone: '987654321' }} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />,
    );

    const phoneInput = screen.getByLabelText(/teléfono/i) as HTMLInputElement;
    expect(phoneInput.value).toBe('987654321');
  });

  it('permite editar el teléfono y lo envía al guardar', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<GuestEditModal guest={guest} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()} />);

    await user.type(screen.getByLabelText(/teléfono/i), '987654321');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phone: '987654321' }));
  });
});
