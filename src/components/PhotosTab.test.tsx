import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/organizerApi', () => ({
  listEventPhotos: vi.fn(),
  moderateEventPhoto: vi.fn(),
  revealEventPhotos: vi.fn(),
}));
vi.mock('./PhotoModerationPanel', () => ({
  default: ({
    source,
    initiallyRevealed,
    onClose,
  }: {
    source: { list: () => Promise<unknown>; moderate: (id: string, s: 'approved') => Promise<unknown>; reveal: () => Promise<unknown> };
    initiallyRevealed: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="moderation" data-revealed={String(initiallyRevealed)}>
      <button type="button" onClick={() => void source.list()}>
        listar
      </button>
      <button type="button" onClick={() => void source.moderate('p1', 'approved')}>
        aprobar
      </button>
      <button type="button" onClick={() => void source.reveal()}>
        revelar
      </button>
      <button type="button" onClick={onClose}>
        cerrar
      </button>
    </div>
  ),
}));

import * as api from '../lib/organizerApi';
import PhotosTab from './PhotosTab';

const event: api.OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
  startsAt: null,
  location: null,
  accessMode: 'list',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  photosRevealedAt: null,
  createdAt: '2026-10-15T00:00:00Z',
};

function photo(id: string, status: 'pending' | 'approved' | 'rejected') {
  return {
    id,
    guestId: 'g1',
    storagePath: `ev-1/g1/${id}.jpg`,
    displayStoragePath: null,
    status,
    createdAt: '2026-10-15T00:00:00Z',
    guestFullName: 'Ana Rojas',
  };
}

beforeEach(() => {
  vi.mocked(api.listEventPhotos).mockReset().mockResolvedValue([photo('a', 'pending'), photo('b', 'approved'), photo('c', 'rejected')]);
  vi.mocked(api.moderateEventPhoto).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.revealEventPhotos).mockReset();
});

describe('PhotosTab', () => {
  it('resume las fotos por estado y ofrece revisar las pendientes', async () => {
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByText('3 fotos · 1 por revisar · 1 aprobadas · 1 rechazadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar 1 foto(s)' })).toBeInTheDocument();
    expect(screen.getByText(/rollo sigue oculto/)).toBeInTheDocument();
  });

  it('avisa que el rollo ya está revelado', async () => {
    render(<PhotosTab event={{ ...event, photosRevealedAt: '2026-10-16T00:00:00Z' }} onEventChange={vi.fn()} />);
    expect(await screen.findByText(/ya está revelado/)).toBeInTheDocument();
  });

  it('abre la moderación con las funciones de este evento', async () => {
    const revealed = { ...event, photosRevealedAt: '2026-10-16T00:00:00Z' };
    vi.mocked(api.revealEventPhotos).mockResolvedValue(revealed);
    const onEventChange = vi.fn();
    render(<PhotosTab event={event} onEventChange={onEventChange} />);

    await userEvent.click(await screen.findByRole('button', { name: /Revisar/ }));
    expect(screen.getByTestId('moderation')).toHaveAttribute('data-revealed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'listar' }));
    await waitFor(() => expect(api.listEventPhotos).toHaveBeenLastCalledWith('ev-1'));

    await userEvent.click(screen.getByRole('button', { name: 'aprobar' }));
    expect(api.moderateEventPhoto).toHaveBeenCalledWith('p1', 'approved');

    await userEvent.click(screen.getByRole('button', { name: 'revelar' }));
    await waitFor(() => expect(onEventChange).toHaveBeenCalledWith(revealed));
    expect(api.revealEventPhotos).toHaveBeenCalledWith('ev-1');

    await userEvent.click(screen.getByRole('button', { name: 'cerrar' }));
    expect(screen.queryByTestId('moderation')).not.toBeInTheDocument();
  });

  it('muestra el error si no se pueden cargar las fotos', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValue(new Error('No pudimos cargar las fotos del evento.'));
    render(<PhotosTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las fotos del evento.');
  });
});
