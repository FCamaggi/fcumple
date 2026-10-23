import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,QR(${text})`) },
}));
vi.mock('../lib/organizerApi', () => ({ rotateActivationCode: vi.fn() }));

import QRCode from 'qrcode';
import { rotateActivationCode, type OrganizerEvent } from '../lib/organizerApi';
import ActivationTab from './ActivationTab';

const CODE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const event: OrganizerEvent = {
  id: 'ev-1',
  slug: 'fiesta-abcd',
  name: 'Fiesta',
  startsAt: null,
  location: null,
  accessMode: 'open',
  cameraUnlock: 'on_event_qr',
  rsvpEnabled: false,
  framesEnabled: true,
  stickersEnabled: true,
  defaultFrameId: null,
  photosRevealedAt: null,
  subtitle: null,
  theme: {},
  activationCode: CODE,
  defaultPhotoQuota: 5,
  enrollment: { welcome: '', plusOnes: null, comment: null, questions: [] },
  createdAt: '2026-10-15T00:00:00Z',
};

const urlFor = (code: string) => `${window.location.origin}/e/fiesta-abcd/a/${code}`;

beforeEach(() => {
  vi.mocked(QRCode.toDataURL).mockClear();
  vi.mocked(rotateActivationCode).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('ActivationTab', () => {
  it('muestra el QR del código de ESTE evento, para imprimir', async () => {
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByAltText('Código QR de activación de la cámara')).toHaveAttribute(
      'src',
      `data:image/png;base64,QR(${urlFor(CODE)})`,
    );
    expect(QRCode.toDataURL).toHaveBeenCalledWith(urlFor(CODE), expect.objectContaining({ width: expect.any(Number) }));
  });

  it('el QR se puede descargar con un nombre claro', async () => {
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    const link = await screen.findByRole('link', { name: 'Descargar QR' });
    expect(link).toHaveAttribute('download', 'qr-activacion-fiesta-abcd.png');
    expect(link.getAttribute('href')).toContain('data:image/png');
  });

  it('explica qué es y cómo se usa, sin jerga', async () => {
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByText(/Imprime este código y ponlo en la fiesta/)).toBeInTheDocument();
    expect(screen.getByText(/con la cámara de su celular/)).toBeInTheDocument();
  });

  it('ofrece probar el enlace del QR', async () => {
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    const link = await screen.findByRole('link', { name: 'Probar el QR' });
    expect(link).toHaveAttribute('href', urlFor(CODE));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('si el evento no usa el QR, avisa cómo activarlo en Ajustes', async () => {
    render(<ActivationTab event={{ ...event, cameraUnlock: 'on_identify' }} onEventChange={vi.fn()} />);
    expect(await screen.findByText(/no usa el QR de la fiesta/)).toBeInTheDocument();
    expect(screen.getByText(/Ajustes/)).toBeInTheDocument();
  });

  it('con el QR activado no muestra ese aviso', async () => {
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    await screen.findByAltText('Código QR de activación de la cámara');
    expect(screen.queryByText(/no usa el QR de la fiesta/)).not.toBeInTheDocument();
  });

  it('cambiar el código pide confirmación, avisa lo que implica y actualiza el QR', async () => {
    vi.mocked(rotateActivationCode).mockResolvedValue('f'.repeat(32));
    const onEventChange = vi.fn();
    render(<ActivationTab event={event} onEventChange={onEventChange} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar el código' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('dejará de servir'));
    expect(rotateActivationCode).toHaveBeenCalledWith('ev-1');
    await waitFor(() => expect(onEventChange).toHaveBeenCalledWith({ ...event, activationCode: 'f'.repeat(32) }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cambiaste el código');
  });

  it('no cambia el código si cancela', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar el código' }));
    expect(rotateActivationCode).not.toHaveBeenCalled();
  });

  it('si falla el cambio, lo dice y deja el código como estaba', async () => {
    vi.mocked(rotateActivationCode).mockRejectedValue(new Error('No pudimos cambiar el código.'));
    const onEventChange = vi.fn();
    render(<ActivationTab event={event} onEventChange={onEventChange} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar el código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cambiar el código.');
    expect(onEventChange).not.toHaveBeenCalled();
  });

  it('sigue mostrando las instrucciones aunque falle el QR', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('boom'));
    render(<ActivationTab event={event} onEventChange={vi.fn()} />);
    expect(await screen.findByText(/Imprime este código/)).toBeInTheDocument();
    expect(screen.queryByAltText(/Código QR/)).not.toBeInTheDocument();
  });
});
