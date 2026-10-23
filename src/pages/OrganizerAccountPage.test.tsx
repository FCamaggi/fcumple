import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/auth', () => ({
  useSession: vi.fn(),
  changePassword: vi.fn(),
}));

import { changePassword, useSession } from '../lib/auth';
import OrganizerAccountPage from './OrganizerAccountPage';

beforeEach(() => {
  vi.mocked(changePassword).mockReset();
  vi.mocked(useSession).mockReturnValue({
    session: { user: { email: 'fran@example.com' } } as never,
    loading: false,
  });
});

function setup() {
  render(
    <MemoryRouter>
      <OrganizerAccountPage />
    </MemoryRouter>,
  );
}

async function fill(current: string, next: string, repeat = next) {
  await userEvent.type(screen.getByLabelText('Contraseña actual'), current);
  await userEvent.type(screen.getByLabelText('Contraseña nueva'), next);
  await userEvent.type(screen.getByLabelText('Repite la contraseña nueva'), repeat);
}

const submit = () => screen.getByRole('button', { name: 'Cambiar contraseña' });

describe('OrganizerAccountPage', () => {
  it('muestra el correo de la cuenta y vuelve a los eventos', () => {
    setup();
    expect(screen.getByText('fran@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tus eventos/ })).toHaveAttribute('href', '/panel');
  });

  it('cambia la contraseña con la actual y la nueva, y limpia los campos', async () => {
    vi.mocked(changePassword).mockResolvedValueOnce(undefined);
    setup();
    await fill('Fran-2026-Temp', 'una-clave-larga');
    await userEvent.click(submit());

    expect(changePassword).toHaveBeenCalledWith('fran@example.com', 'Fran-2026-Temp', 'una-clave-larga');
    expect(await screen.findByRole('status')).toHaveTextContent('Cambiaste tu contraseña.');
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('');
  });

  it('exige 8 caracteres como mínimo, sin consultar', async () => {
    setup();
    await fill('Fran-2026-Temp', 'corta');
    await userEvent.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('avisa si las dos contraseñas nuevas no coinciden, sin consultar', async () => {
    setup();
    await fill('Fran-2026-Temp', 'una-clave-larga', 'otra-clave-larga');
    await userEvent.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('pide la contraseña actual', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'una-clave-larga');
    await userEvent.type(screen.getByLabelText('Repite la contraseña nueva'), 'una-clave-larga');
    await userEvent.click(submit());
    expect(screen.getByRole('alert')).toHaveTextContent('contraseña actual');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('muestra el error cuando la actual es incorrecta y conserva lo escrito en la nueva', async () => {
    vi.mocked(changePassword).mockRejectedValueOnce(new Error('La contraseña actual no es correcta.'));
    setup();
    await fill('mala', 'una-clave-larga');
    await userEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta.');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('una-clave-larga');
  });

  it('los campos son de contraseña y se autocompletan como corresponde', () => {
    setup();
    expect(screen.getByLabelText('Contraseña actual')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('type', 'password');
  });
});
