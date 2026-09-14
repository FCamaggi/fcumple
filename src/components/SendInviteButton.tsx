import type { EventConfig } from '../types';

const FALLBACK = 'por confirmar';

// Los emoji de la plantilla (ver buildInviteMessage) se escriben como
// escapes explícitos `\u{...}` en vez de pegar el glifo literal en el
// código fuente. Un glifo pegado directo puede corromperse en mojibake
// ("�") si el archivo se guarda/edita con un encoding distinto de UTF-8 en
// algún punto de la cadena de herramientas (el usuario accede al repo desde
// Windows vía red) -- el escape de code point es inmune a eso porque el
// motor de JS lo resuelve en tiempo de parseo, no depende de cómo el
// archivo .tsx haya sido guardado en disco.
const PARTY_POPPER = '\u{1F389}'; // 🎉
const CALENDAR = '\u{1F4C5}'; // 📅
const CLOCK_TEN = '\u{1F559}'; // 🕙
const ROUND_PUSHPIN = '\u{1F4CD}'; // 📍

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Se arma a mano en vez de usar Intl/toLocaleDateString('es-CL', ...) para
// controlar el formato exacto que pide la plantilla ("viernes 9 de octubre
// de 2026", sin coma tras el día de la semana) sin depender de cómo cada
// runtime/locale de Intl decida puntuar esa combinación.
function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return `${DIAS[date.getDay()]} ${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatHora(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} hrs`;
}

// Usa solo el primer nombre del invitado (el usuario pidió un mensaje más
// corto/directo): separa por el primer espacio tras recortar espacios al
// inicio/fin y colapsar espacios múltiples entre palabras. Si no hay
// espacio, usa el nombre completo tal cual.
function firstName(fullName: string): string {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const spaceIdx = trimmed.indexOf(' ');
  return spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
}

/**
 * Arma el mensaje exacto de
 * docs/05-comunicacion/sistema-de-mensajes.md § "Plantilla del mensaje",
 * interpolando los datos reales de `event_config` y el link personal del
 * invitado. Si el evento todavía no tiene fecha/lugar cargados, degrada a
 * "por confirmar" en vez de mostrar un hueco o un `null` crudo.
 */
export function buildInviteMessage(guestName: string, token: string, eventConfig: EventConfig | null): string {
  const fecha = eventConfig?.eventDate ? formatFecha(eventConfig.eventDate) : FALLBACK;
  const hora = eventConfig?.eventDate ? formatHora(eventConfig.eventDate) : FALLBACK;
  const lugar = eventConfig?.location ?? FALLBACK;
  const link = `${window.location.origin}/i/${token}`;
  const nombre = firstName(guestName);

  return `¡Hola ${nombre}! ${PARTY_POPPER} Estás invitado/a a mi cumpleaños.

${CALENDAR} ${fecha}
${CLOCK_TEN} ${hora}
${ROUND_PUSHPIN} ${lugar}

Confirma tu asistencia acá (y avísame si vienes con alguien más):
${link}

¡Espero verte ahí!`;
}

// Deja solo dígitos -- saca espacios, guiones, paréntesis y el "+" inicial
// que el admin puede haber tipeado a mano en el campo de teléfono, para
// armar el path `wa.me/<digits>` (que no acepta ningún otro carácter).
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

interface SendInviteButtonProps {
  guestName: string;
  token: string;
  eventConfig: EventConfig | null;
  /**
   * Teléfono de WhatsApp del invitado (guests.phone), si el admin lo cargó.
   * Cuando está presente arma un link `wa.me/<numero>` que abre directo la
   * conversación de ese contacto; si no, cae al comportamiento genérico de
   * siempre (`wa.me/?text=...`, sin destinatario) y el admin elige el
   * contacto a mano.
   */
  phone?: string | null;
}

/**
 * SendInviteButton — el asistente de envío por WhatsApp
 * (docs/05-comunicacion/sistema-de-mensajes.md). Abre `wa.me` con el
 * mensaje precargado; con teléfono cargado, apunta directo a ese contacto,
 * y sin teléfono, sin destinatario fijo para que el admin lo elija a mano.
 */
export default function SendInviteButton({ guestName, token, eventConfig, phone }: SendInviteButtonProps) {
  function handleClick() {
    const message = buildInviteMessage(guestName, token, eventConfig);
    const digits = phone ? normalizePhone(phone) : '';
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="bg-smoke-700/30 px-2 py-1 font-mono text-[11px] font-bold uppercase text-paper-100 transition-colors hover:bg-smoke-700/50"
    >
      Enviar invitación
    </button>
  );
}
