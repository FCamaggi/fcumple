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

// Los emoji del mensaje se escapan como \u{...} en el código fuente (ver
// buildInviteMessage) en vez de pegarse como glifo literal, precisamente
// para blindarse contra el mojibake que reportó el usuario al abrir el
// archivo desde Windows por red. Este test compara code points exactos, no
// solo "contiene la palabra esperada", para detectar una regresión de
// encoding aunque el string siga "pareciendo" el mismo a simple vista.
const PARTY_POPPER = '\u{1F389}';
const CALENDAR = '\u{1F4C5}';
const CLOCK_TEN = '\u{1F559}';
const ROUND_PUSHPIN = '\u{1F4CD}';

describe('buildInviteMessage', () => {
  it('builds the exact template with the guest first name, formatted date/time, location and personal link', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', eventConfig);

    expect(message).toContain(`¡Hola Maria! ${PARTY_POPPER} Estás invitado/a a mi cumpleaños.`);
    expect(message).toContain(`${CALENDAR} viernes 9 de octubre de 2026`);
    expect(message).toContain(`${CLOCK_TEN} 22:00 hrs`);
    expect(message).toContain(`${ROUND_PUSHPIN} Pasaje Argentina 2299, Independencia`);
    expect(message).toContain('Confirma tu asistencia acá (y avísame si vienes con alguien más):');
    expect(message).toContain(`${window.location.origin}/i/mafe-8842`);
    expect(message).toContain('¡Espero verte ahí!');
  });

  it('emits the exact emoji code points, guarding against mojibake regressions', () => {
    const message = buildInviteMessage('Maria', 'mafe-8842', eventConfig);

    expect([...message].filter((ch) => ch === PARTY_POPPER)).toHaveLength(1);
    expect([...message].filter((ch) => ch === CALENDAR)).toHaveLength(1);
    expect([...message].filter((ch) => ch === CLOCK_TEN)).toHaveLength(1);
    expect([...message].filter((ch) => ch === ROUND_PUSHPIN)).toHaveLength(1);
    // Nunca debe colarse el carácter de reemplazo Unicode que delata un
    // mojibake real (U+FFFD).
    expect(message).not.toContain('�');
  });

  it('falls back to "por confirmar" when the event has no date/location configured yet', () => {
    const message = buildInviteMessage('Maria Fernanda', 'mafe-8842', null);

    expect(message).toContain(`${CALENDAR} por confirmar`);
    expect(message).toContain(`${CLOCK_TEN} por confirmar`);
    expect(message).toContain(`${ROUND_PUSHPIN} por confirmar`);
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
