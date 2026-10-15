import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/platformApi', () => ({
  registerGuest: vi.fn(),
  loginGuest: vi.fn(),
}));

import { loginGuest, registerGuest, type EventPublic } from '../lib/platformApi';
import IdentifyForm from './IdentifyForm';

const baseEvent: EventPublic = {
  id: 'ev-1',
  name: 'Cumple de Fabrizio',
  startsAt: null,
  location: null,
  rsvpDeadline: null,
  accessMode: 'open',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealed: false,
};

const ok = { outcome: 'ok' as const, guestToken: 'tok', guestId: 'g1', guestName: 'Ana Rojas' };
const none = { guestToken: null, guestId: null, guestName: null };

beforeEach(() => {
  vi.mocked(registerGuest).mockReset();
  vi.mocked(loginGuest).mockReset();
});

async function fillRegister(name: string, pin: string, repeat = pin) {
  await userEvent.type(screen.getByLabelText('Nombre y apellido'), name);
  await userEvent.type(screen.getByLabelText(/Elige un PIN/), pin);
  await userEvent.type(screen.getByLabelText('Repite tu PIN'), repeat);
}

describe('IdentifyForm: inscribirme', () => {
  it('se inscribe con nombre, apellido y PIN, y entrega la sesión', async () => {
    vi.mocked(registerGuest).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={baseEvent} onIdentified={onIdentified} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(registerGuest).toHaveBeenCalledWith('fiesta-abcd', 'Ana Rojas', '4821');
    expect(loginGuest).not.toHaveBeenCalled();
  });

  it('no consulta con una sola palabra en el nombre', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu nombre y tu apellido.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('exige un PIN de 4 a 6 números', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '12');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El PIN debe tener entre 4 y 6 números.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it('solo acepta números en el PIN', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    const pin = screen.getByLabelText(/Elige un PIN/);
    await userEvent.type(pin, '12ab34');
    expect(pin).toHaveValue('1234');
  });

  it('avisa si los dos PIN no coinciden, sin consultar', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '4821', '4822');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Los dos PIN no coinciden.');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it.each([
    ['name_taken', /Ya hay alguien inscrito/],
    ['not_found', /No te encontramos en la lista/],
    ['ambiguous', /más de una persona/],
    ['pending_approval', /solicitud quedó pendiente/],
  ] as const)('muestra el mensaje para %s, vacía los PIN y no deja entrar', async (outcome, message) => {
    vi.mocked(registerGuest).mockResolvedValueOnce({ outcome, ...none });
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="s" event={{ ...baseEvent, accessMode: 'list_requests' }} onIdentified={onIdentified} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onIdentified).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveValue('');
    expect(screen.getByLabelText('Repite tu PIN')).toHaveValue('');
  });

  it('conserva lo escrito si falla la red o hay demasiados intentos, para reintentar', async () => {
    vi.mocked(registerGuest).mockRejectedValueOnce(new Error('Demasiados intentos seguidos. Espera unos minutos.'));
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);

    await fillRegister('Ana Rojas', '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos seguidos.');
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveValue('4821');
  });
});

describe('IdentifyForm: ya me inscribí', () => {
  async function openLogin() {
    await userEvent.click(screen.getByRole('button', { name: 'Ya me inscribí' }));
  }

  it('entra con nombre y PIN, sin pedir repetirlo', async () => {
    vi.mocked(loginGuest).mockResolvedValueOnce(ok);
    const onIdentified = vi.fn();
    render(<IdentifyForm slug="fiesta-abcd" event={baseEvent} onIdentified={onIdentified} />);
    await openLogin();

    expect(screen.queryByLabelText('Repite tu PIN')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onIdentified).toHaveBeenCalledWith({ token: 'tok', guestName: 'Ana Rojas' }));
    expect(loginGuest).toHaveBeenCalledWith('fiesta-abcd', 'Ana Rojas', '4821');
    expect(registerGuest).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', /Nombre o PIN incorrectos/],
    ['ambiguous', /más de una persona/],
    ['locked', /Espera 10 minutos/],
    ['needs_registration', /Todavía no te inscribes/],
    ['pending_approval', /sigue pendiente/],
  ] as const)('muestra el mensaje para %s', async (outcome, message) => {
    vi.mocked(loginGuest).mockResolvedValueOnce({ outcome, ...none });
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await openLogin();

    await userEvent.type(screen.getByLabelText('Nombre y apellido'), 'Ana Rojas');
    await userEvent.type(screen.getByLabelText('Tu PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Tu PIN')).toHaveValue('');
  });

  it('cambiar de pestaña limpia el mensaje y los PIN', async () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    await fillRegister('Ana Rojas', '12');
    await userEvent.click(screen.getByRole('button', { name: 'Inscribirme y entrar' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await openLogin();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tu PIN')).toHaveValue('');
  });

  it('el PIN es un campo de contraseña (no queda a la vista)', () => {
    render(<IdentifyForm slug="s" event={baseEvent} onIdentified={vi.fn()} />);
    expect(screen.getByLabelText(/Elige un PIN/)).toHaveAttribute('type', 'password');
  });
});
