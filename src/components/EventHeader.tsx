import type { EventPublic } from '../lib/platformApi';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));
}

interface EventHeaderProps {
  event: Pick<EventPublic, 'name' | 'subtitle' | 'startsAt' | 'location'>;
  guestName: string;
}

/** La cabecera del invitado ya dentro: el evento, su subtítulo, el saludo, la fecha y el lugar. */
export default function EventHeader({ event, guestName }: EventHeaderProps) {
  const date = formatDate(event.startsAt);
  return (
    <header className="flex w-full max-w-md flex-col gap-1 text-center">
      <span className="font-display text-2xl uppercase leading-tight tracking-wide text-laser-500">{event.name}</span>
      {event.subtitle && <span className="font-sans text-sm text-paper-100/80">{event.subtitle}</span>}
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Hola, {guestName.split(' ')[0]}</h1>
      {date && <p className="font-sans text-sm text-paper-100/80">{date}</p>}
      {event.location && <p className="font-sans text-sm text-paper-100/80">{event.location}</p>}
    </header>
  );
}
