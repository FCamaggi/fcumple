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
  subtitle: null,
  theme: {},
  activationCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  createdAt: '2026-10-15T00:00:00Z',
};

describe('EventSettingsPanel', () => {
  it('guarda los cambios de acceso y cámara', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={event} onSave={onSave} />);

    await userEvent.selectOptions(screen.getByLabelText('Quién puede entrar'), 'list_requests');
    await userEvent.selectOptions(screen.getByLabelText('La cámara se habilita'), 'on_checkin');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Fiesta',
      location: 'Casa',
      defaultPhotoQuota: 5,
      accessMode: 'list_requests',
      cameraUnlock: 'on_checkin',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ajustes guardados.');
  });

  describe('hora límite de la cámara', () => {
    it('guarda la hora que se escribe y no la reenvía si no se toca', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<EventSettingsPanel event={event} onSave={onSave} />);
      expect(screen.getByLabelText(/La cámara se cierra a las/)).toHaveValue('');

      fireEvent.change(screen.getByLabelText(/La cámara se cierra a las/), { target: { value: '2026-10-31T03:00' } });
      await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ cameraClosesAt: localInputToIso('2026-10-31T03:00') }),
      );

      onSave.mockClear();
      render(<EventSettingsPanel event={{ ...event, cameraClosesAt: '2026-10-31T06:00:00.000Z' }} onSave={onSave} />);
      await userEvent.click(screen.getAllByRole('button', { name: 'Guardar ajustes' })[1]);
      expect(onSave.mock.calls[0][0]).not.toHaveProperty('cameraClosesAt');
    });

    it('se puede quitar el límite dejando la hora vacía', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<EventSettingsPanel event={{ ...event, cameraClosesAt: '2026-10-31T06:00:00.000Z' }} onSave={onSave} />);
      fireEvent.change(screen.getByLabelText(/La cámara se cierra a las/), { target: { value: '' } });
      await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cameraClosesAt: null }));
    });

    it('«Cerrar la cámara ahora» pide confirmación y guarda la hora actual', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const confirm = vi.spyOn(window, 'confirm');
      render(<EventSettingsPanel event={event} onSave={onSave} />);

      confirm.mockReturnValueOnce(false);
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar la cámara ahora' }));
      expect(onSave).not.toHaveBeenCalled();

      confirm.mockReturnValueOnce(true);
      const before = Date.now();
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar la cámara ahora' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      const sent = Date.parse(onSave.mock.calls[0][0].cameraClosesAt);
      expect(sent).toBeGreaterThanOrEqual(before);
      expect(sent).toBeLessThanOrEqual(Date.now());
      expect(await screen.findByRole('status')).toHaveTextContent('La cámara quedó cerrada.');
      confirm.mockRestore();
    });
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

  it('guarda el subtítulo, y lo borra si se deja en blanco', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<EventSettingsPanel event={event} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText(/Subtítulo/), 'Cumpleaños Martina');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ subtitle: 'Cumpleaños Martina' }));
    unmount();

    const onSave2 = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, subtitle: 'Cumpleaños Martina' }} onSave={onSave2} />);
    await userEvent.clear(screen.getByLabelText(/Subtítulo/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave2).toHaveBeenCalledWith(expect.objectContaining({ subtitle: null }));
  });

  it('el subtítulo tiene un máximo de 80 caracteres', () => {
    render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/Subtítulo/)).toHaveAttribute('maxlength', '80');
  });

  it('elige el estilo del evento entre los presets y guarda solo su id', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={event} onSave={onSave} />);
    expect(screen.getByLabelText('Estilo del evento')).toHaveValue('neon');
    expect(screen.getByRole('option', { name: 'Rosa chicle y negro' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Estilo del evento'), 'rosa-chicle');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ theme: { preset: 'rosa-chicle' } }));
  });

  describe('vista previa del estilo', () => {
    function frameWindow(): Window {
      return (screen.getByTitle(/vista previa/i) as HTMLIFrameElement).contentWindow as Window;
    }

    it('empieza cerrada: no carga ningún teléfono hasta que se pide', () => {
      render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
      expect(screen.queryByTitle(/vista previa/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver cómo queda' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('al abrirla muestra el teléfono del evento y no pone el estilo en la dirección', async () => {
      render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Ver cómo queda' }));

      const src = screen.getByTitle(/vista previa/i).getAttribute('src') ?? '';
      expect(src).toContain('/panel/e/ev-1/vista-previa');
      expect(src).not.toContain('rosa-chicle');
      expect(screen.getByRole('button', { name: 'Ocultar vista previa' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('al elegir otro preset se lo manda al teléfono por mensaje, sin guardar', async () => {
      const onSave = vi.fn();
      render(<EventSettingsPanel event={event} onSave={onSave} />);
      await userEvent.click(screen.getByRole('button', { name: 'Ver cómo queda' }));
      const post = vi.spyOn(frameWindow(), 'postMessage');

      await userEvent.selectOptions(screen.getByLabelText('Estilo del evento'), 'rosa-chicle');

      expect(post).toHaveBeenLastCalledWith(
        { type: 'fcumple-preview', state: 'activa', draft: null, themeId: 'rosa-chicle' },
        window.location.origin,
      );
      expect(onSave).not.toHaveBeenCalled();
    });

    it('volver a ocultarla quita el teléfono', async () => {
      render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Ver cómo queda' }));
      await userEvent.click(screen.getByRole('button', { name: 'Ocultar vista previa' }));
      expect(screen.queryByTitle(/vista previa/i)).not.toBeInTheDocument();
    });
  });

  it('carga el estilo actual y no lo reenvía si no se toca', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, theme: { preset: 'rosa-chicle' } }} onSave={onSave} />);
    expect(screen.getByLabelText('Estilo del evento')).toHaveValue('rosa-chicle');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('theme');
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('subtitle');
  });

  it('ofrece el QR de la fiesta como forma recomendada de habilitar la cámara', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventSettingsPanel event={{ ...event, cameraUnlock: 'on_identify' }} onSave={onSave} />);
    expect(screen.getByRole('option', { name: /QR de la fiesta \(recomendado\)/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('La cámara se habilita'), 'on_event_qr');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cameraUnlock: 'on_event_qr' }));
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

  it('no ofrece el RSVP: no tiene pantalla para el invitado y vaciaría el aforo', () => {
    render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
    expect(screen.queryByLabelText(/confirmación de asistencia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/RSVP/)).not.toBeInTheDocument();
  });

  it('explica que cada invitado elige su PIN y que no se pide RUT, correo ni teléfono', () => {
    render(<EventSettingsPanel event={event} onSave={vi.fn()} />);
    expect(screen.getByText(/un PIN que elige él mismo/)).toBeInTheDocument();
    expect(screen.getByText(/No se pide RUT, correo ni teléfono/)).toBeInTheDocument();
  });
});
