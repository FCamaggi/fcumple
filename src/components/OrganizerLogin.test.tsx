import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/auth', () => ({ signIn: vi.fn(), signUp: vi.fn() }));

import { signIn, signUp } from '../lib/auth';
import OrganizerLogin from './OrganizerLogin';

beforeEach(() => {
  vi.mocked(signIn).mockReset();
  vi.mocked(signUp).mockReset();
});

async function openSignup() {
  await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('OrganizerLogin: iniciar sesión', () => {
  it('inicia sesión con correo y contraseña', async () => {
    vi.mocked(signIn).mockResolvedValueOnce(undefined);
    render(<OrganizerLogin />);

    await userEvent.type(screen.getByLabelText('Correo'), ' ana@example.com ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(signIn).toHaveBeenCalledWith('ana@example.com', 'secreta-123');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('muestra el error si falla', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Invalid login credentials'));
    render(<OrganizerLogin />);

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });
});

describe('OrganizerLogin: crear cuenta', () => {
  async function fillPasswords(password: string, repeat = password) {
    await userEvent.type(screen.getByLabelText('Contraseña'), password);
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), repeat);
  }

  async function fill(password: string, repeat = password) {
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.com');
    await fillPasswords(password, repeat);
  }

  it('crea la cuenta; si no hay que confirmar, no muestra aviso (la sesión se abre sola)', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ needsConfirmation: false });
    render(<OrganizerLogin />);
    await openSignup();
    await fill('contraseña-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect(signUp).toHaveBeenCalledWith('ana@example.com', 'contraseña-larga');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pide revisar el correo cuando hay que confirmar, y vuelve a "Entrar"', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ needsConfirmation: true });
    render(<OrganizerLogin />);
    await openSignup();
    await fill('contraseña-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Te enviamos un correo');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('exige 8 caracteres y que las dos contraseñas coincidan, sin llamar al servidor', async () => {
    render(<OrganizerLogin />);
    await openSignup();

    await fill('corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');

    await userEvent.clear(screen.getByLabelText('Contraseña'));
    await userEvent.clear(screen.getByLabelText('Repite la contraseña'));
    await fillPasswords('contraseña-larga', 'otra-distinta-1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');

    expect(signUp).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor (p. ej. correo ya registrado)', async () => {
    vi.mocked(signUp).mockRejectedValueOnce(new Error('Ya existe una cuenta con ese correo. Inicia sesión.'));
    render(<OrganizerLogin />);
    await openSignup();
    await fill('contraseña-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una cuenta');
  });

  it('cambiar de pestaña limpia mensajes y contraseñas', async () => {
    render(<OrganizerLogin />);
    await openSignup();
    await fill('corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });
});
