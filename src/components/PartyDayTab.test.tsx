import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/organizerApi', () => ({
  listEventPhotos: vi.fn(),
  moderateEventPhoto: vi.fn(),
  publishPhotoBatch: vi.fn(),
}));
vi.mock('./PhotoModerationPanel', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="moderation">
      <button type="button" onClick={onClose}>
        cerrar revisión
      </button>
    </div>
  ),
}));

import * as api from '../lib/organizerApi';
import PartyDayTab from './PartyDayTab';

const event = {
  id: 'ev-1',
  name: 'Fiesta',
  cameraUnlock: 'on_event_qr',
  photosRevealedAt: null,
} as unknown as api.OrganizerEvent;

function photo(id: string, status: 'pending' | 'approved' | 'rejected', publishedAt: string | null = null) {
  return { id, status, publishedAt, guestFullName: 'Ana Rojas' } as unknown as Awaited<
    ReturnType<typeof api.listEventPhotos>
  >[number];
}

function guest(id: string, over: Partial<api.OrganizerGuest> = {}): api.OrganizerGuest {
  return {
    id,
    eventId: 'ev-1',
    fullName: `Invitada ${id}`,
    token: 't',
    approvalStatus: 'approved',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    photoQuota: 5,
    answers: {},
    plusOnesRequested: 0,
    checkedInAt: null,
    claimedAt: null,
    lastSeenAt: null,
    cameraActivatedAt: null,
    ...over,
  } as api.OrganizerGuest;
}

const guests = [
  guest('uno', { cameraActivatedAt: '2026-10-30T23:10:00Z' }),
  guest('dos'),
  guest('tres'),
];

function renderTab(over: { event?: api.OrganizerEvent; guests?: api.OrganizerGuest[]; onOpenTab?: () => void } = {}) {
  const onOpenTab = over.onOpenTab ?? vi.fn();
  const onEventChange = vi.fn();
  const onRefresh = vi.fn();
  render(
    <PartyDayTab
      event={over.event ?? event}
      guests={over.guests ?? guests}
      onEventChange={onEventChange}
      onOpenTab={onOpenTab}
      onRefresh={onRefresh}
    />,
  );
  return { onOpenTab, onEventChange, onRefresh };
}

beforeEach(() => {
  vi.mocked(api.listEventPhotos)
    .mockReset()
    .mockResolvedValue([photo('a', 'pending'), photo('b', 'pending'), photo('c', 'approved'), photo('d', 'rejected')]);
  vi.mocked(api.publishPhotoBatch).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PartyDayTab: fotos', () => {
  it('mientras carga lo dice', () => {
    renderTab();
    expect(screen.getByText(/cargando fotos/i)).toBeInTheDocument();
  });

  it('dice cuántas fotos faltan por revisar y cuántas aprobadas esperan publicarse', async () => {
    renderTab();

    expect(await screen.findByText('2 por revisar')).toBeInTheDocument();
    expect(screen.getByText(/1 aprobada\(s\) sin publicar/i)).toBeInTheDocument();
  });

  it('«Revisar» abre la revisión ahí mismo y, al cerrarla, vuelve a contar', async () => {
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Revisar 2 foto(s)' }));

    expect(screen.getByTestId('moderation')).toBeInTheDocument();
    const before = vi.mocked(api.listEventPhotos).mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'cerrar revisión' }));

    expect(screen.queryByTestId('moderation')).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.listEventPhotos).mock.calls.length).toBeGreaterThan(before));
  });

  it('publica el lote a un toque, con su confirmación, y avisa cuántas salieron', async () => {
    vi.mocked(api.publishPhotoBatch).mockResolvedValueOnce(1);
    const { onEventChange } = renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Publicar 1 aprobada(s)' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(api.publishPhotoBatch).toHaveBeenCalledWith('ev-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Publicaste 1 foto(s).');
    expect(onEventChange).toHaveBeenCalled();
  });

  it('sin aprobadas por publicar el botón de publicar está apagado', async () => {
    vi.mocked(api.listEventPhotos).mockResolvedValue([photo('a', 'pending')]);
    renderTab();

    expect(await screen.findByRole('button', { name: 'Publicar 0 aprobada(s)' })).toBeDisabled();
  });

  it('sin fotos todavía lo dice y no ofrece revisar', async () => {
    vi.mocked(api.listEventPhotos).mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/todavía no llegan fotos/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revisar/i })).not.toBeInTheDocument();
  });

  it('si no carga muestra el error y «Reintentar» vuelve a pedirlas', async () => {
    vi.mocked(api.listEventPhotos).mockRejectedValueOnce(new Error('sin red'));
    renderTab();

    expect(await screen.findByRole('alert')).toHaveTextContent('sin red');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('2 por revisar')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PartyDayTab: actualizar', () => {
  it('«Actualizar» vuelve a pedir las fotos y avisa para que se relea la lista de invitados', async () => {
    const { onRefresh } = renderTab();
    await screen.findByText('2 por revisar');
    vi.mocked(api.listEventPhotos).mockResolvedValue([photo('a', 'pending')]);

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('1 por revisar')).toBeInTheDocument();
  });
});

describe('PartyDayTab: cámara', () => {
  it('cuando la cámara se abre al identificarse nadie queda esperando', async () => {
    renderTab({ event: { ...event, cameraUnlock: 'on_identify' } as api.OrganizerEvent });

    expect(screen.getByText('3 de 3 activaron la cámara')).toBeInTheDocument();
    expect(screen.getByText(/todos tienen la cámara/i)).toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('con QR dice cuántos activaron la cámara y quiénes faltan', async () => {
    renderTab();

    expect(screen.getByText('1 de 3 activaron la cámara')).toBeInTheDocument();
    expect(screen.getByText('Invitada dos')).toBeInTheDocument();
    expect(screen.getByText('Invitada tres')).toBeInTheDocument();
    expect(screen.queryByText('Invitada uno')).not.toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('con una lista larga muestra los primeros y cuenta el resto', async () => {
    const many = Array.from({ length: 11 }, (_, i) => guest(`g${i}`));
    renderTab({ guests: many });

    expect(screen.getByText('0 de 11 activaron la cámara')).toBeInTheDocument();
    expect(screen.getAllByTestId('missing-guest')).toHaveLength(8);
    expect(screen.getByText('y 3 más')).toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('si todos la activaron lo celebra y no lista a nadie', async () => {
    renderTab({ guests: [guest('a', { cameraActivatedAt: '2026-10-30T23:10:00Z' })] });

    expect(screen.getByText('1 de 1 activaron la cámara')).toBeInTheDocument();
    expect(screen.getByText(/todos tienen la cámara/i)).toBeInTheDocument();
    expect(screen.queryByTestId('missing-guest')).not.toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('sin invitados aprobados lo dice', async () => {
    renderTab({ guests: [] });

    expect(screen.getByText(/todavía no hay invitados aprobados/i)).toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('con check-in cuenta a quienes ya entraron por la puerta', async () => {
    renderTab({
      event: { ...event, cameraUnlock: 'on_checkin' } as api.OrganizerEvent,
      guests: [guest('a', { checkedInAt: '2026-10-30T23:00:00Z' }), guest('b')],
    });

    expect(screen.getByText('1 de 2 activaron la cámara')).toBeInTheDocument();
    expect(screen.getByText(/al entrar por la puerta/i)).toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });

  it('el atajo lleva al QR cuando la cámara se activa con él, y a los invitados siempre', async () => {
    const { onOpenTab } = renderTab();

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar el QR' }));
    expect(onOpenTab).toHaveBeenLastCalledWith('activacion');
    await userEvent.click(screen.getByRole('button', { name: 'Ver invitados' }));
    expect(onOpenTab).toHaveBeenLastCalledWith('invitados');
    await screen.findByText('2 por revisar');
  });

  it('sin QR de evento no ofrece mostrarlo', async () => {
    renderTab({ event: { ...event, cameraUnlock: 'on_identify' } as api.OrganizerEvent });

    expect(screen.queryByRole('button', { name: 'Mostrar el QR' })).not.toBeInTheDocument();
    await screen.findByText('2 por revisar');
  });
});
