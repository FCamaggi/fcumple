import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateGuestModal from './CreateGuestModal';

describe('CreateGuestModal', () => {
  it('precargar el cupo de fotos en 3 + cupo de acompañantes', () => {
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={vi.fn()} />);

    const quotaInput = screen.getByLabelText(/cupo de fotos/i) as HTMLInputElement;
    expect(quotaInput.value).toBe('3');
  });

  it('recalcula el cupo de fotos mientras el admin no lo haya tocado a mano', async () => {
    const user = userEvent.setup();
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={vi.fn()} />);

    const plusOnesInput = screen.getByLabelText(/cupo de acompañantes/i);
    await user.clear(plusOnesInput);
    await user.type(plusOnesInput, '2');

    const quotaInput = screen.getByLabelText(/cupo de fotos/i) as HTMLInputElement;
    expect(quotaInput.value).toBe('5');
  });

  it('deja de recalcular el cupo de fotos una vez que el admin lo edita a mano', async () => {
    const user = userEvent.setup();
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={vi.fn()} />);

    const quotaInput = screen.getByLabelText(/cupo de fotos/i) as HTMLInputElement;
    await user.clear(quotaInput);
    await user.type(quotaInput, '10');

    const plusOnesInput = screen.getByLabelText(/cupo de acompañantes/i);
    await user.clear(plusOnesInput);
    await user.type(plusOnesInput, '4');

    expect(quotaInput.value).toBe('10');
  });

  it('envía fullName, plusOnesAllowed y photoQuota al crear', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Invitado');
    const plusOnesInput = screen.getByLabelText(/cupo de acompañantes/i);
    await user.clear(plusOnesInput);
    await user.type(plusOnesInput, '2');

    await user.click(screen.getByRole('button', { name: /crear/i }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Nuevo Invitado',
      plusOnesAllowed: 2,
      photoQuota: 5,
    }));
  });

  it('incluye el teléfono cuando el admin lo carga, y lo omite si lo deja vacío', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Invitado');
    await user.type(screen.getByLabelText(/teléfono/i), '+56 9 1234 5678');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Nuevo Invitado', phone: '+56 9 1234 5678' }),
    );
  });

  it('no incluye phone cuando el campo queda vacío', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<CreateGuestModal open onClose={vi.fn()} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Invitado');
    await user.click(screen.getByRole('button', { name: /crear/i }));

    const call = onCreate.mock.calls[0][0];
    expect(call.phone).toBeUndefined();
  });
});
