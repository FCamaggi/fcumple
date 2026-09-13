import type { EventConfig } from '../types';

const FALLBACK = 'por confirmar';

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

  return `¡Hola ${guestName}! 🎉 Estás invitado/a a mi cumpleaños.

📅 ${fecha}
🕙 ${hora}
📍 ${lugar}

Confirma tu asistencia acá (y avísame si vienes con alguien más):
${link}

¡Espero verte ahí!`;
}

interface SendInviteButtonProps {
  guestName: string;
  token: string;
  eventConfig: EventConfig | null;
}

/**
 * SendInviteButton — el asistente de envío por WhatsApp
 * (docs/05-comunicacion/sistema-de-mensajes.md). Abre `wa.me` con el
 * mensaje precargado y sin destinatario fijo: el admin elige el contacto
 * correcto desde su propio WhatsApp. No guarda ni transmite ningún
 * teléfono -- el proyecto no almacena esa información.
 */
export default function SendInviteButton({ guestName, token, eventConfig }: SendInviteButtonProps) {
  function handleClick() {
    const message = buildInviteMessage(guestName, token, eventConfig);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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
