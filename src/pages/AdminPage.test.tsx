import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  revealPhotos: vi.fn(),
}));
vi.mock('../lib/photosApi', () => ({
  listAllPhotosForModeration: vi.fn(),
  moderatePhoto: vi.fn(),
  getSignedPhotoUrl: vi.fn(),
}));
vi.mock('../lib/postsApi', () => ({
  listAllPosts: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
}));

import { listGuests, createGuest, updateGuest, deleteGuest } from '../lib/adminApi';
import { signOut } from '../lib/auth';
import { getEventConfig } from '../lib/eventApi';
import { listAllPosts } from '../lib/postsApi';
import { listAllPhotosForModeration } from '../lib/photosApi';
import AdminPage from './AdminPage';

function mockViewport(isMobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: isMobile,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      // Framer Motion's useReducedMotion still calls the legacy
      // addListener/removeListener pair internally.
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  );
}

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
  checkedInAt: null,
};

beforeEach(() => {
  mockViewport(false);
  vi.mocked(listGuests).mockReset();
  vi.mocked(createGuest).mockReset();
  vi.mocked(updateGuest).mockReset();
  vi.mocked(deleteGuest).mockReset();
  vi.mocked(signOut).mockReset();
  vi.mocked(getEventConfig).mockReset();
  vi.mocked(getEventConfig).mockResolvedValue(null);
  vi.mocked(listAllPosts).mockReset();
  vi.mocked(listAllPosts).mockResolvedValue([]);
  vi.mocked(listAllPhotosForModeration).mockReset();
  vi.mocked(listAllPhotosForModeration).mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminPage', () => {
  it('loads and shows the guest list', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);

    render(<AdminPage />);

    expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
  });

  // docs/BACKLOG.md Etapa 5, Parte B: el invitado semilla de dev
  // (isDev: true) nunca debe inflar los números reales de logística.
  it('excludes the dev guest from the confirmed and real-headcount tallies', async () => {
    const devGuest: Guest = {
      ...guest,
      id: 'dev1',
      token: 'dev-preview',
      fullName: 'Invitado DEV',
      status: 'confirmed',
      plusOnesConfirmed: 5,
      isDev: true,
    };
    const realGuest: Guest = { ...guest, id: 'g2', status: 'confirmed', plusOnesConfirmed: 1 };
    vi.mocked(listGuests).mockResolvedValueOnce([devGuest, realGuest]);

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    const tally = screen.getByText('Live tally').parentElement!;
    const confirmedRow = within(tally).getByText('Confirmados').parentElement!.parentElement!;
    expect(within(confirmedRow).getByText('1')).toBeInTheDocument();

    const realHeadcountRow = within(tally).getByText(/headcount real/i).parentElement!.parentElement!;
    expect(within(realHeadcountRow).getByText('2')).toBeInTheDocument();
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

  it('opens the posts panel and loads the announcements', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    vi.mocked(listAllPosts).mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Ya salió la lista',
        body: 'Revisen el link',
        publishedAt: null,
        createdAt: '2026-04-28T00:00:00Z',
      },
    ]);
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: /avisos/i }));

    expect(await screen.findByText('Ya salió la lista')).toBeInTheDocument();
    expect(listAllPosts).toHaveBeenCalled();
  });

  it('opens the photo moderation panel and loads the pending queue', async () => {
    vi.mocked(listGuests).mockResolvedValueOnce([guest]);
    vi.mocked(listAllPhotosForModeration).mockResolvedValueOnce([
      {
        id: 'ph1',
        guestId: 'g1',
        storagePath: 'mafe-8842/a.jpg',
        status: 'pending',
        createdAt: '2026-06-01T00:00:00Z',
        guestFullName: 'Maria Fernanda Contreras',
      },
    ]);
    const user = userEvent.setup();

    render(<AdminPage />);
    await screen.findByText(/maria fernanda contreras/i);

    await user.click(screen.getByRole('button', { name: /^fotos$/i }));

    expect(await screen.findByText(/cola de moderación/i)).toBeInTheDocument();
    expect(listAllPhotosForModeration).toHaveBeenCalled();
  });

  describe('modo puerta (mobile)', () => {
    it('shows only the scanner toggle, the door list and the headcount meter', async () => {
      mockViewport(true);
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);

      render(<AdminPage />);

      expect(await screen.findByText(/maria fernanda contreras/i)).toBeInTheDocument();
      expect(screen.getByText(/aforo vu/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /escáner/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^evento$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^avisos$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^fotos$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /importar csv/i })).not.toBeInTheDocument();
    });

    it('links to the full console from door mode', async () => {
      mockViewport(true);
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);
      const user = userEvent.setup();

      render(<AdminPage />);
      await screen.findByText(/maria fernanda contreras/i);

      await user.click(screen.getByRole('button', { name: /ver consola completa/i }));

      expect(screen.getByRole('button', { name: /^evento$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^avisos$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^fotos$/i })).toBeInTheDocument();
    });

    it('lets the admin go back to door mode from the full console, still on mobile', async () => {
      mockViewport(true);
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);
      const user = userEvent.setup();

      render(<AdminPage />);
      await screen.findByText(/maria fernanda contreras/i);

      await user.click(screen.getByRole('button', { name: /ver consola completa/i }));
      expect(screen.getByRole('button', { name: /^evento$/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /volver al modo puerta/i }));

      expect(screen.queryByRole('button', { name: /^evento$/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ver consola completa/i })).toBeInTheDocument();
    });

    it('does not show the door-mode link on desktop', async () => {
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);

      render(<AdminPage />);
      await screen.findByText(/maria fernanda contreras/i);

      expect(screen.queryByRole('button', { name: /ver consola completa/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^evento$/i })).toBeInTheDocument();
    });

    it('shows the guest list as compact stacked cards instead of the wide table', async () => {
      mockViewport(true);
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);

      render(<AdminPage />);
      await screen.findByText(/maria fernanda contreras/i);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('lets the header stack and wrap instead of overflowing on a narrow screen', async () => {
      mockViewport(true);
      vi.mocked(listGuests).mockResolvedValueOnce([guest]);

      render(<AdminPage />);
      await screen.findByText(/maria fernanda contreras/i);

      const header = screen.getByRole('banner');
      expect(header.className).toContain('flex-col');
      const actions = screen.getByTestId('admin-header-actions');
      expect(actions.className).toContain('flex-wrap');
    });
  });
});
