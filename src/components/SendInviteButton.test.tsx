import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendInviteButton, { buildInviteMessage } from './SendInviteButton';
import type { EventConfig } from '../types';

const eventConfig: EventConfig = {
  eventName: 'Cumpleaños Fabrizio',
  eventDate: '2026-10-09T22:00:00',
  location: 'Pasaje Argentina 2299, Independencia',
  theme: null,
  rsvpDeadline: '2026-10-01T23:59:00',
  photosRevealedAt: null,
};

describe('buildInviteMessage', () => {
  it('builds the exact template with the guest first name, formatted date/time, location and personal link', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', eventConfig);

    expect(message).toContain('¡Hola Maria! Estás invitad@ a mi cumpleaños.');
    expect(message).toContain('Fecha: viernes 9 de octubre de 2026');
    expect(message).toContain('Hora: 22:00 hrs');
    expect(message).toContain('Lugar: Pasaje Argentina 2299, Independencia');
    expect(message).toContain('Confirma tu asistencia acá (y avísame si vienes con alguien más):');
    expect(message).toContain(`${window.location.origin}/i/mafe-8842`);
    expect(message).toContain('¡Espero verte ahí!');
  });

  // Regresión real: un intento anterior usaba emoji (con escape \u{...} en
  // el código fuente) y llegaban como "�" en WhatsApp Desktop real, sin
  // importar cómo se escribiera el código. Sin emoji en el mensaje, no hay
  // ningún carácter que dependa de una fuente/encoding del lado receptor.
  it('never contains emoji or the Unicode replacement character', () => {
    const message = buildInviteMessage('Maria', 'mafe-8842', eventConfig);

    expect(message).not.toContain('�');
    expect(/\p{Extended_Pictographic}/u.test(message)).toBe(false);
  });

  it('falls back to "por confirmar" when the event has no date/location configured yet', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', null);

    expect(message).toContain('Fecha: por confirmar');
    expect(message).toContain('Hora: por confirmar');
    expect(message).toContain('Lugar: por confirmar');
  });

  describe('first-name extraction', () => {
    it('uses only the first name when the guest has a full name', () => {
      const message = buildInviteMessage('Maria Fernanda Contreras', 'mafe-8842', null);
      expect(message).toContain('¡Hola Maria!');
    });

    it('uses the name as-is when there is no space', () => {
      const message = buildInviteMessage('Fernanda', 'mafe-8842', null);
      expect(message).toContain('¡Hola Fernanda!');
    });

    it('trims leading/trailing whitespace before splitting', () => {
      const message = buildInviteMessage('  Maria Fernanda  ', 'mafe-8842', null);
      expect(message).toContain('¡Hola Maria!');
    });

    it('collapses multiple spaces between first and last name', () => {
      const message = buildInviteMessage('Maria   Fernanda', 'mafe-8842', null);
      expect(message).toContain('¡Hola Maria!');
    });
  });
});

describe('SendInviteButton', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('opens wa.me with the encoded message and no phone number when the guest has none', async () => {
    const user = userEvent.setup();
    render(<SendInviteButton guestName="Maria Fernanda" token="mafe-8842" eventConfig={eventConfig} />);

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url, target, features] = vi.mocked(window.open).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    // No phone number ever gets baked into the link -- the admin picks the
    // contact by hand inside WhatsApp (docs/05-comunicacion/sistema-de-mensajes.md).
    expect(String(url)).not.toMatch(/wa\.me\/\d/);
    expect(decodeURIComponent(String(url).replace('https://wa.me/?text=', ''))).toContain('Maria');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });

  it('opens a direct wa.me/<digits> link when the guest has a phone', async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton
        guestName="Maria Fernanda"
        token="mafe-8842"
        eventConfig={eventConfig}
        phone="+56 (9) 1234-5678"
      />,
    );

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    const [url] = vi.mocked(window.open).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/wa\.me\/56912345678\?text=/);
  });

  it('falls back to the generic link when phone is null', async () => {
    const user = userEvent.setup();
    render(
      <SendInviteButton guestName="Maria Fernanda" token="mafe-8842" eventConfig={eventConfig} phone={null} />,
    );

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    const [url] = vi.mocked(window.open).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
