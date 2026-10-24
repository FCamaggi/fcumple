import { useState } from 'react';
import { describeEvent } from '../../api/event-meta';

interface LinkCardPreviewProps {
  event: {
    name: string;
    slug: string;
    subtitle?: string | null;
    startsAt?: string | null;
    location?: string | null;
  };
  /** `https://dominio`: de ahí sale el dominio que muestra la tarjeta. */
  origin: string;
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

function Card({ event, origin }: LinkCardPreviewProps) {
  // La imagen propia vive en `public/og/<slug>.jpg`. Si no existe, el sitio responde con `index.html` y la
  // imagen no carga: ahí la tarjeta real también sale sin imagen, y este dibujo hace lo mismo.
  const [imageFailed, setImageFailed] = useState(false);
  // El mismo texto que arma `api/event-meta.ts` para los rastreadores: no se copia, se reutiliza.
  const description = describeEvent({
    name: event.name,
    subtitle: event.subtitle ?? null,
    startsAt: event.startsAt ?? null,
    location: event.location ?? null,
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Así se verá el enlace en WhatsApp"
        className="flex max-w-sm flex-col border border-smoke-700/50 bg-ink-900"
      >
        {!imageFailed && (
          <img
            src={`/og/${event.slug}.jpg`}
            alt="Imagen de la tarjeta"
            onError={() => setImageFailed(true)}
            className="aspect-[1200/630] w-full object-cover"
          />
        )}
        <div className="flex flex-col gap-1 p-3">
          <p className="font-sans text-sm font-bold text-paper-100">{event.name.trim()}</p>
          <p className="font-sans text-sm text-paper-100/70">{description}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-paper-100/50">{hostOf(origin)}</p>
        </div>
      </div>
      {imageFailed && (
        <p className="font-sans text-xs text-paper-100/60">Sin imagen propia: la tarjeta sale solo con texto.</p>
      )}
      <p className="font-sans text-xs text-paper-100/60">
        WhatsApp puede tardar en actualizarla si ya viste este enlace antes.
      </p>
    </div>
  );
}

/**
 * LinkCardPreview — la tarjeta que verá quien reciba el enlace del evento por WhatsApp: imagen, título,
 * descripción y dominio. Solo dibuja; no manda nada ni crea datos. Se reconstruye al cambiar de evento, para
 * no arrastrar el fallo de la imagen del anterior.
 */
export default function LinkCardPreview({ event, origin }: LinkCardPreviewProps) {
  return <Card key={event.slug} event={event} origin={origin} />;
}
