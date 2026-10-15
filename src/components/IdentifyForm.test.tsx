import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/platformApi', () => ({
  identifyByName: vi.fn(),
  identifyByRut: vi.fn(),
}));

import { identifyByName, identifyByRut, type EventPublic } from '../lib/platformApi';
import IdentifyForm from './IdentifyForm';

const baseEvent: EventPublic = {
  id: 'ev-1',
  name: 'Cumple de Fabrizio',
  startsAt: null,
  location: null,
  rsvpDeadline: null,
  accessMode: 'list',
  identifier: 'name',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealed: false,
};

const ok = { outcome: 'ok' as const, guestToken: 'tok', guestId: 'g1', guestName: 'Ana Rojas' };

beforeEach(() => {
  vi.mocked(identifyByName).mockReset();
  vi.mocked(identifyByRut).mockReset();
});

describe('IdentifyForm (por nombre)', () => {
  it('pide nombre y apellido y entrega la sesión al acertar', async () => {
    vi.mocked(identifyByName).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={baseEvent} onIdentified={onIdentified} />);

    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(identifyByName).toHaveBeenCalledWith('fiesta-abcd', 'Ana Rojas');
  });

  it('no consulta con una sola palabra', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu nombre y tu apellido.');
    expect(identifyByName).not.toHaveBeenCalled();
  });

  it.each([
    ['ambiguous', /más de una persona/],
    ['not_found', /No te encontramos/],
    ['pending_approval', /pendiente/],
  ] as const)('muestra el mensaje para %s y no deja entrar', async (outcome, message) => {
    vi.mocked(identifyByName).mockResolvedValueOnce({ outcome, guestToken: null, guestId: null, guestName: null });
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={onIdentified} />);

    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('muestra el error de la API (p. ej. demasiados intentos)', async () => {
    vi.mocked(identifyByName).mockRejectedValueOnce(new Error('Demasiados intentos seguidos.'));
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos seguidos.');
  });
});

describe('IdentifyForm (por RUT)', () => {
  const rutEvent: EventPublic = { ...baseEvent, identifier: 'rut_lookup' };

  it('da formato al RUT mientras se escribe y avisa que no se guarda', async () => {
    render(<IdentifyForm slug="s" event={rutEvent} onIdentified={vi.fn()} />);
    const input = screen.getByLabelText('Tu RUT');

    await userEvent.type(input, '123456785');

    expect(input).toHaveValue('12.345.678-5');
    expect(screen.getByText(/No lo guardamos/)).toBeInTheDocument();
  });

  it('rechaza un RUT con dígito verificador incorrecto sin llamar al servidor', async () => {
    render(<IdentifyForm slug="s" event={rutEvent} onIdentified={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Tu RUT'), '123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/error de tipeo/);
    expect(identifyByRut).not.toHaveBeenCalled();
  });

  it('envía el RUT, entrega la sesión y vacía el campo', async () => {
    vi.mocked(identifyByRut).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={rutEvent} onIdentified={onIdentified} />);

    const input = screen.getByLabelText('Tu RUT');
    await userEvent.type(input, '123456785');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(identifyByRut).toHaveBeenCalledWith('fiesta-abcd', '12.345.678-5');
    expect(input).toHaveValue('');
    expect(identifyByName).not.toHaveBeenCalled();
  });

  it('conserva lo escrito si falla la red, para reintentar', async () => {
    vi.mocked(identifyByRut).mockRejectedValueOnce(new Error('No pudimos conectarnos.'));
    render(<IdentifyForm slug="s" event={rutEvent} onIdentified={vi.fn()} />);

    const input = screen.getByLabelText('Tu RUT');
    await userEvent.type(input, '123456785');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
    expect(input).toHaveValue('12.345.678-5');
  });
});
