import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventSettingsPanel from './EventSettingsPanel';
import type { OrganizerEvent } from '../lib/organizerApi';
import { isoToLocalInput, localInputToIso } from '../lib/localDateTime';

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
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
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
      defaultPhotoQuota: 5,
      accessMode: 'list_requests',
      cameraUnlock: 'on_checkin',
      rsvpEnabled: true,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ajustes guardados.');
  });

  it('muestra la fecha del evento y guarda la que se escribe', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, startsAt: '2026-10-30T23:30:00.000Z' }} onSave={onSave} />);
    expect(screen.getByLabelText('Fecha y hora')).toHaveValue(isoToLocalInput('2026-10-30T23:30:00.000Z'));

    fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: '2026-10-31T21:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startsAt: localInputToIso('2026-10-31T21:00') }));
  });

  it('si no toca la fecha, no la reenvía', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, startsAt: '2026-10-30T23:30:00.000Z' }} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('startsAt');
  });

  it('se puede quitar la fecha', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, startsAt: '2026-10-30T23:30:00.000Z' }} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startsAt: null }));
  });

  it('guarda las fotos por invitado', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={event} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText('Fotos por invitado'));
    await userEvent.type(screen.getByLabelText('Fotos por invitado'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ defaultPhotoQuota: 10 }));
  });

  it.each(['', '-1', '101', '2.5'])('no deja guardar %j fotos por invitado', async (value) => {
    const onSave = vi.fn();
    render(<EventSettingsPanel event={event} onSave={onSave} />);
    const input = screen.getByLabelText('Fotos por invitado');
    await userEvent.clear(input);
    if (value) fireEvent.change(input, { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/entre 0 y 100/);
    expect(onSave).not.toHaveBeenCalled();
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
