import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}));

import QRCode from 'qrcode';
import ShareEventLink from './ShareEventLink';

const event = { name: 'Cumple de Fabrizio', slug: 'cumple-abcd' };

beforeEach(() => {
  vi.mocked(QRCode.toDataURL).mockClear();
});

describe('ShareEventLink', () => {
  it('muestra el enlace único del evento', () => {
    render(<ShareEventLink event={event} />);
    expect(screen.getByText(`${window.location.origin}/e/cumple-abcd`)).toBeInTheDocument();
  });

  it('genera el QR del mismo enlace y ofrece descargarlo', async () => {
    render(<ShareEventLink event={event} />);
    const image = await screen.findByAltText('Código QR de Cumple de Fabrizio');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(`${window.location.origin}/e/cumple-abcd`, expect.anything());
    expect(screen.getByRole('link', { name: 'Descargar QR' })).toHaveAttribute('download', 'qr-cumple-abcd.png');
  });

  it('copia el enlace al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareEventLink event={event} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/e/cumple-abcd`);
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
  });

  it('ofrece un único mensaje de WhatsApp sin destinatario', () => {
    render(<ShareEventLink event={event} />);
    const link = screen.getByRole('link', { name: 'Compartir por WhatsApp' });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('/e/cumple-abcd');
  });

  it('permite probar el enlace tal como lo verán los invitados', async () => {
    render(<ShareEventLink event={event} />);
    const link = screen.getByRole('link', { name: 'Probar el enlace' });
    expect(link.getAttribute('href')).toMatch(/\/e\/cumple-abcd$/);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled());
  });

  it('sigue mostrando el enlace aunque falle el QR', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('boom'));
    render(<ShareEventLink event={event} />);
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled());
    expect(screen.queryByAltText(/Código QR/)).not.toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/e/cumple-abcd`)).toBeInTheDocument();
  });
});
