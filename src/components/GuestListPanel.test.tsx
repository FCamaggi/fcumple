import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuestListPanel from './GuestListPanel';
import type { OrganizerGuest } from '../lib/organizerApi';

function guest(overrides: Partial<OrganizerGuest> = {}): OrganizerGuest {
  return {
    id: 'g1',
    eventId: 'ev-1',
    fullName: 'Ana Rojas',
    token: 'tok',
    approvalStatus: 'approved',
    status: 'pending',
    plusOnesAllowed: 0,
    plusOnesConfirmed: 0,
    photoQuota: 5,
    checkedInAt: null,
    claimedAt: null,
    lastSeenAt: null,
    ...overrides,
  };
}

function setup(guests: OrganizerGuest[], overrides: Record<string, unknown> = {}) {
  const props = {
    guests,
    onAdd: vi.fn().mockResolvedValue({ created: [], failed: [] }),
    onReview: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onRegenerate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<GuestListPanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('GuestListPanel', () => {
  it('cuenta invitados y quienes ya entraron, y muestra el estado de cada uno', () => {
    setup([
      guest({ id: '1', fullName: 'Ana Rojas', claimedAt: '2026-10-15T20:00:00Z' }),
      guest({ id: '2', fullName: 'Beto Mora' }),
      guest({ id: '3', fullName: 'Carla Diaz', claimedAt: '2026-10-15T20:00:00Z', checkedInAt: '2026-10-15T21:00:00Z' }),
    ]);
    expect(screen.getByText('Invitados: 3 · han entrado: 2')).toBeInTheDocument();
    expect(screen.getByText('Entró')).toBeInTheDocument();
    expect(screen.getByText('Aún no entra')).toBeInTheDocument();
    expect(screen.getByText('Llegó')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay invitados', () => {
    setup([]);
    expect(screen.getByText(/Todavía no hay invitados/)).toBeInTheDocument();
  });

  it('agrega un invitado por línea e ignora líneas vacías', async () => {
    const props = setup([]);
    await userEvent.type(screen.getByLabelText(/Agregar invitados/), 'Ana Rojas{enter}{enter}  Beto Mora  ');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(props.onAdd).toHaveBeenCalledWith(['Ana Rojas', 'Beto Mora']);
  });

  it('deja en el cuadro solo las líneas que fallaron y explica por qué', async () => {
    const props = setup([], {
      onAdd: vi.fn().mockResolvedValue({
        created: [guest()],
        failed: [{ name: 'Madonna', reason: 'Cada invitado necesita nombre y apellido (dos palabras).' }],
      }),
    });
    const box = screen.getByLabelText(/Agregar invitados/);
    await userEvent.type(box, 'Ana Rojas{enter}Madonna');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Agregaste 1; 1 no se pudieron agregar');
    expect(screen.getByRole('alert')).toHaveTextContent('Madonna: Cada invitado necesita nombre y apellido');
    expect(box).toHaveValue('Madonna');
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('muestra las solicitudes pendientes aparte y permite aprobarlas o rechazarlas', async () => {
    const pending = guest({ id: 'p1', fullName: 'Pedro Pascal', approvalStatus: 'pending' });
    const props = setup([guest(), pending]);

    expect(screen.getByRole('region', { name: 'Solicitudes de acceso' })).toHaveTextContent('Pedro Pascal');
    expect(screen.getByText('Invitados: 1 · han entrado: 0')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(props.onReview).toHaveBeenCalledWith(pending, 'approved');
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(props.onReview).toHaveBeenCalledWith(pending, 'rejected');
  });

  it('pide confirmación antes de regenerar el acceso o quitar a alguien', async () => {
    const ana = guest();
    const props = setup([ana]);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer acceso' }));
    expect(props.onRegenerate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Restablecer acceso' }));
    expect(props.onRegenerate).toHaveBeenCalledWith(ana);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(props.onRemove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(props.onRemove).toHaveBeenCalledWith(ana);
  });

  it('muestra el error si una acción falla', async () => {
    setup([guest()], { onRemove: vi.fn().mockRejectedValue(new Error('No tienes permiso para modificar este evento.')) });
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'));
  });
});
