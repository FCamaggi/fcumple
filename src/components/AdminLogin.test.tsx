import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/auth', () => ({
  signIn: vi.fn(),
}));

import { signIn } from '../lib/auth';
import AdminLogin from './AdminLogin';

beforeEach(() => {
  vi.mocked(signIn).mockReset();
});

describe('AdminLogin', () => {
  it('calls signIn with the entered credentials', async () => {
    vi.mocked(signIn).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<AdminLogin />);
    await user.type(screen.getByLabelText(/email/i), 'admin@fcumple.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'secreta');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(signIn).toHaveBeenCalledWith('admin@fcumple.com', 'secreta');
  });

  it('shows an error message when signIn fails', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Invalid login credentials'));
    const user = userEvent.setup();

    render(<AdminLogin />);
    await user.type(screen.getByLabelText(/email/i), 'admin@fcumple.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'incorrecta');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
  });
});
