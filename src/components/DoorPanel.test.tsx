import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DoorPanel from './DoorPanel';
import type { OrganizerGuest } from '../lib/organizerApi';

function guest(overrides: Partial<OrganizerGuest> = {}): OrganizerGuest {
  return {
    id: 'g1',
    eventId: 'ev-1',
    fullName: 'Ana María Rojas',
    token: 'tok',
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
    ...overrides,
  };
}

const guests = [
  guest(),
  guest({ id: 'g2', fullName: 'Beto Mora', checkedInAt: '2026-10-15T22:00:00Z' }),
  guest({ id: 'g3', fullName: 'Pedro Pascal', approvalStatus: 'pending' }),
];

function setup(onCheckIn = vi.fn().mockResolvedValue(undefined)) {
  const onOpenScanner = vi.fn();
  render(<DoorPanel guests={guests} onCheckIn={onCheckIn} onOpenScanner={onOpenScanner} />);
  return { onCheckIn, onOpenScanner };
}

describe('DoorPanel', () => {
  it('cuenta solo a los invitados aprobados', () => {
    setup();
    expect(screen.getByText('Han llegado: 1 de 2')).toBeInTheDocument();
  });

  it('abre el escáner', async () => {
    const { onOpenScanner } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir escáner' }));
    expect(onOpenScanner).toHaveBeenCalled();
  });

  it('busca sin importar tildes, mayúsculas ni orden, y marca la llegada', async () => {
    const { onCheckIn } = setup();
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'rojas MARIA');

    expect(screen.getByText('Ana María Rojas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }));
    expect(onCheckIn).toHaveBeenCalledWith(guests[0]);
  });

  it('muestra "Ya llegó" a quien ya fue marcado, sin botón', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'Beto');
    expect(screen.getByText('Ya llegó')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar llegada' })).not.toBeInTheDocument();
  });

  it('no ofrece a quien tiene la solicitud pendiente', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'Pascal');
    expect(screen.getByText(/No encontramos a nadie/)).toBeInTheDocument();
  });

  it('muestra el error si marcar la llegada falla', async () => {
    setup(vi.fn().mockRejectedValue(new Error('No pudimos registrar el check-in.')));
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar llegada' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos registrar el check-in.');
  });
});

describe('DoorPanel: sin invitados', () => {
  it('sin invitados aprobados lo dice y explica cuándo aparecerán', () => {
    render(<DoorPanel guests={[]} onCheckIn={vi.fn()} onOpenScanner={vi.fn()} />);
    expect(screen.getByText(/todavía no hay invitados aprobados/i)).toBeInTheDocument();
  });

  it('si solo hay solicitudes sin aprobar, también lo dice', () => {
    render(<DoorPanel guests={[guest({ approvalStatus: 'pending' })]} onCheckIn={vi.fn()} onOpenScanner={vi.fn()} />);
    expect(screen.getByText(/todavía no hay invitados aprobados/i)).toBeInTheDocument();
  });

  it('sin invitados aprobados no suma un «no encontramos a nadie» al buscar', async () => {
    render(<DoorPanel guests={[]} onCheckIn={vi.fn()} onOpenScanner={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'ana');

    expect(screen.getByText(/todavía no hay invitados aprobados/i)).toBeInTheDocument();
    expect(screen.queryByText(/no encontramos a nadie/i)).not.toBeInTheDocument();
  });

  it('con invitados aprobados no lo dice', () => {
    render(<DoorPanel guests={[guest()]} onCheckIn={vi.fn()} onOpenScanner={vi.fn()} />);
    expect(screen.queryByText(/todavía no hay invitados aprobados/i)).not.toBeInTheDocument();
  });
});
