import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Guest } from '../types';

vi.mock('../lib/adminApi', () => ({
  listGuests: vi.fn(),
  createGuest: vi.fn(),
  updateGuest: vi.fn(),
  deleteGuest: vi.fn(),
}));
vi.mock('../lib/auth', () => ({
  signOut: vi.fn(),
}));
vi.mock('../lib/eventApi', () => ({
  getEventConfig: vi.fn(),
  updateEventConfig: vi.fn(),
}));

import { listGuests, createGuest, updateGuest, deleteGuest } from '../lib/adminApi';
import { signOut } from '../lib/auth';
import { getEventConfig } from '../lib/eventApi';
import AdminPage from './AdminPage';

const guest: Guest = {
  id: 'g1',
  token: 'mafe-8842',
  fullName: 'Maria Fernanda Contreras',
  status: 'pending',
  plusOnesAllowed: 2,
  plusOnesConfirmed: 0,
  guestNote: null,
  adminNote: null,
  respondedAt: null,
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(listGuests).mockReset();
  vi.mocked(createGuest).mockReset();
  vi.mocked(updateGuest).mockReset();
  vi.mocked(deleteGuest).mockReset();
  vi.mocked(signOut).mockReset();
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(getEventConfig).mockResolvedValue(null);
});

describe('AdminPage', () => {
  it('loads and shows the guest list', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);

    render(<AdminPage />);

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });

  it('shows an error toast when the list fails to load', async () => {
    vi.mocked(listGuests).mockRejectedValueOnce(new Error('sin conexión'));

    render(<AdminPage />);

    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument();
  });

  it('creates a guest and adds it to the list', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([]);
    vi.mocked(createGuest).mockResolvedValueOnce({ ...guest, id: 'g2', fullName: 'Nuevo Invitado' });
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/agregar primer invitado/i);

    await user.click(screen.getByRole('button', { name: /agregar primer invitado/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Nuevo Invitado');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    expect(createGuest).toHaveBeenCalledWith({ fullName: 'Nuevo Invitado', plusOnesAllowed: 0 });
    expect(await screen.findByText('Nuevo Invitado')).toBeInTheDocument();
  });

  it('edits a guest and persists the change', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    vi.mocked(updateGuest).mockResolvedValueOnce({ ...guest, fullName: 'Nombre Editado' });
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: /editar/i }));
    const nameInput = screen.getByLabelText(/nombre del invitado/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Nombre Editado');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(updateGuest).toHaveBeenCalledWith('g1', expect.objectContaining({ fullName: 'Nombre Editado' }));
    expect(await screen.findByText('Nombre Editado')).toBeInTheDocument();
  });

  it('deletes a guest after confirming and removes it from the list', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    vi.mocked(deleteGuest).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: /editar/i }));
    await user.click(screen.getByRole('button', { name: /eliminar invitado/i }));
    await user.click(screen.getByRole('button', { name: /seguro/i }));

    expect(deleteGuest).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(screen.queryByText(/maria fernanda contreras/i)).not.toBeInTheDocument());
  });

  it('logs out when the logout button is used', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    vi.mocked(signOut).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /cerrar sesión/i }));

    expect(signOut).toHaveBeenCalled();
  });

  it('opens the event settings panel and loads the form', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: /evento/i }));

    expect(await screen.findByLabelText(/nombre del evento/i)).toBeInTheDocument();
    expect(getEventConfig).toHaveBeenCalled();
  });
});
