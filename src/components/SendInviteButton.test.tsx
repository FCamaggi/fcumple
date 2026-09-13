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
  it('builds the exact template with the guest name, formatted date/time, location and personal link', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', eventConfig);

    expect(message).toContain('¡Hola Maria Fernanda! 🎉 Estás invitado/a a mi cumpleaños.');
    expect(message).toContain('📅 viernes 9 de octubre de 2026');
    expect(message).toContain('🕙 22:00 hrs');
    expect(message).toContain('📍 Pasaje Argentina 2299, Independencia');
    expect(message).toContain('Confirma tu asistencia acá (y avísame si vienes con alguien más):');
    expect(message).toContain(`${window.location.origin}/i/mafe-8842`);
    expect(message).toContain('¡Espero verte ahí!');
  });

  it('falls back to "por confirmar" when the event has no date/location configured yet', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', null);

    expect(message).toContain('📅 por confirmar');
    expect(message).toContain('🕙 por confirmar');
    expect(message).toContain('📍 por confirmar');
  });
});

describe('SendInviteButton', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('opens wa.me with the encoded message and no phone number when clicked', async () => {
    const user = userEvent.setup();
    render(<SendInviteButton guestName="Maria Fernanda" token="mafe-8842" eventConfig={eventConfig} />);

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url, target, features] = vi.mocked(window.open).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    // No phone number ever gets baked into the link -- the admin picks the
    // contact by hand inside WhatsApp (docs/05-comunicacion/sistema-de-mensajes.md).
    expect(String(url)).not.toMatch(/wa\.me\/\d/);
    expect(decodeURIComponent(String(url).replace('https://wa.me/?text=', ''))).toContain('Maria Fernanda');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });
});
