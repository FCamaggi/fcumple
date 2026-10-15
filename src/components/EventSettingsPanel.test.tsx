import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventSettingsPanel from './EventSettingsPanel';
import type { OrganizerEvent } from '../lib/organizerApi';

const event: OrganizerEvent = {
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
  createdAt: '2026-10-15T00:00:00Z',
};

describe('EventSettingsPanel', () => {
  it('guarda los cambios de acceso, cámara y RSVP', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={event} onSave={onSave} />);

    await userEvent.selectOptions(screen.getByLabelText('Quién puede entrar'), 'list_requests');
    await userEvent.selectOptions(screen.getByLabelText('La cámara se habilita'), 'on_checkin');
    await userEvent.click(screen.getByLabelText(/Pedir confirmación/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Fiesta',
      location: 'Casa',
      accessMode: 'list_requests',
      cameraUnlock: 'on_checkin',
      rsvpEnabled: true,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ajustes guardados.');
  });

  it('no deja guardar un evento sin nombre', async () => {
    const onSave = vi.fn();
    render(<EventSettingsPanel event={event} onSave={onSave} />);

    await userEvent.clear(screen.getByLabelText('Nombre del evento'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('necesita un nombre');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('muestra el error si guardar falla', async () => {
    render(<EventSettingsPanel event={event} onSave={vi.fn().mockRejectedValue(new Error('No pudimos guardar los ajustes del evento.'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar los ajustes');
  });

  it('explica que cada invitado elige su PIN y que no se pide RUT, correo ni teléfono', () => {
    render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
    expect(screen.getByText(/un PIN que elige él mismo/)).toBeInTheDocument();
    expect(screen.getByText(/No se pide RUT, correo ni teléfono/)).toBeInTheDocument();
  });
});
