import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/organizerApi', () => ({
  listEventOwners: vi.fn(),
  createOwnerInvite: vi.fn(),
}));

import { createOwnerInvite, listEventOwners, type EventOwner, type OrganizerEvent } from '../lib/organizerApi';
import EventOwnersSection from './EventOwnersSection';
import EventSettingsPanel from './EventSettingsPanel';

const ownersFixture: EventOwner[] = [
  {
    userId: 'u-1',
    email: 'martina@example.com',
    isCreator: true,
    isMe: false,
    createdAt: '2026-10-15T00:00:00Z',
  },
  {
    userId: 'u-2',
    email: 'camila@example.com',
    isCreator: false,
    isMe: true,
    createdAt: '2026-10-16T00:00:00Z',
  },
  {
    userId: 'u-3',
    email: 'diego@example.com',
    isCreator: false,
    isMe: false,
    createdAt: '2026-10-17T00:00:00Z',
  },
];

const sampleEvent: OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
  startsAt: null,
  location: 'Casa',
  accessMode: 'list',
  cameraUnlock: 'on_identify',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: null,
  theme: {},
  activationCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  createdAt: '2026-10-15T00:00:00Z',
};

beforeEach(() => {
  vi.mocked(listEventOwners).mockReset();
  vi.mocked(createOwnerInvite).mockReset();
});

describe('EventOwnersSection', () => {
  it('lista los dueños por correo con las insignias «Tú» y «Creador» donde corresponde', async () => {
    vi.mocked(listEventOwners).mockResolvedValueOnce(ownersFixture);
    render(<EventOwnersSection eventId="ev-1" />);

    const martinaRow = (await screen.findByText('martina@example.com')).closest('li') as HTMLElement;
    expect(listEventOwners).toHaveBeenCalledWith('ev-1');
    const camilaRow = screen.getByText('camila@example.com').closest('li') as HTMLElement;
    const diegoRow = screen.getByText('diego@example.com').closest('li') as HTMLElement;

    expect(within(martinaRow).getByText('Creador')).toBeInTheDocument();
    expect(within(martinaRow).queryByText('Tú')).not.toBeInTheDocument();

    expect(within(camilaRow).getByText('Tú')).toBeInTheDocument();
    expect(within(camilaRow).queryByText('Creador')).not.toBeInTheDocument();

    expect(within(diegoRow).queryByText('Tú')).not.toBeInTheDocument();
    expect(within(diegoRow).queryByText('Creador')).not.toBeInTheDocument();
  });

  it('genera un link de invitación de solo lectura con la nota de 7 días', async () => {
    vi.mocked(listEventOwners).mockResolvedValueOnce(ownersFixture);
    vi.mocked(createOwnerInvite).mockResolvedValueOnce('tok-inv-99');
    render(<EventOwnersSection eventId="ev-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Generar link de invitación' }));

    expect(createOwnerInvite).toHaveBeenCalledWith('ev-1');
    const expectedUrl = `${window.location.origin}/panel/unirse/tok-inv-99`;
    const input = await screen.findByDisplayValue(expectedUrl);
    expect(input).toHaveAttribute('readonly');
    expect(screen.getByText('Sirve una vez y vence en 7 días.')).toBeInTheDocument();
  });

  it('copia el link generado al portapapeles al pulsar «Copiar»', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(listEventOwners).mockResolvedValueOnce(ownersFixture);
    vi.mocked(createOwnerInvite).mockResolvedValueOnce('tok-copiar');
    render(<EventOwnersSection eventId="ev-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Generar link de invitación' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/panel/unirse/tok-copiar`);
  });

  it('muestra en línea el error al generar un link de invitación', async () => {
    vi.mocked(listEventOwners).mockResolvedValueOnce(ownersFixture);
    vi.mocked(createOwnerInvite).mockRejectedValueOnce(
      new Error('Llegaste al máximo de invitaciones activas (5). Espera a que se usen o venzan.'),
    );
    render(<EventOwnersSection eventId="ev-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Generar link de invitación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Llegaste al máximo de invitaciones activas (5). Espera a que se usen o venzan.',
    );
  });

  it('muestra en línea el error si falla la carga de dueños', async () => {
    vi.mocked(listEventOwners).mockRejectedValueOnce(new Error('No pudimos cargar los dueños del evento.'));
    render(<EventOwnersSection eventId="ev-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los dueños del evento.');
  });

  it('se integra como sección «Dueños» dentro de EventSettingsPanel', async () => {
    vi.mocked(listEventOwners).mockResolvedValueOnce([
      {
        userId: 'u-1',
        email: 'martina@example.com',
        isCreator: true,
        isMe: true,
        createdAt: '2026-10-15T00:00:00Z',
      },
    ]);
    render(<EventSettingsPanel event={sampleEvent} onSave={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Dueños' })).toBeInTheDocument();
    expect(await screen.findByText('martina@example.com')).toBeInTheDocument();
    expect(screen.getByText('Tú')).toBeInTheDocument();
    expect(screen.getByText('Creador')).toBeInTheDocument();
  });
});
