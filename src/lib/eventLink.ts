/** Enlace único del evento y mensaje genérico para el grupo de WhatsApp. */

export function eventUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, '')}/e/${slug}`;
}

/**
 * Un solo mensaje para todos (reemplaza el envío uno por uno de la Fase 0).
 * Los emoji van como escapes para que ningún editor o encoding los corrompa.
 */
export function whatsappMessage(eventName: string, url: string): string {
  return [
    `\u{1F4F8} ${eventName}`,
    '',
    'Entra con este enlace, escribe tu nombre y apellido y listo:',
    url,
  ].join('\n');
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
