import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getEventConfig, getPublicHeadcount } from '../lib/eventApi';
import { listPublishedPosts } from '../lib/postsApi';
import { getSignedPhotoUrl, listRevealedPhotos } from '../lib/photosApi';
import AnnouncementFeed from '../components/AnnouncementFeed';
import RevealedRoll from '../components/RevealedRoll';
import type { EventConfig, Photo, Post } from '../types';

/**
 * `/evento` — el hub público (docs/BACKLOG.md, Decisión 4.3). Es la
 * cartelera del club: cuenta atrás para la fiesta, los avisos, y el rollo
 * revelado, todo sin token ni login -- 100% abierto, coherente con el tono
 * ya establecido para el QR de puerta. El único dato de "quién va" que se
 * expone es un número (`getPublicHeadcount`), nunca nombres.
 *
 * Rediseño (Etapa 5, Parte D): el feed de avisos es el contenido principal
 * -- antes era al revés, con el aforo gigante y protagonista y los avisos
 * reducidos a un ticker chico. El aforo pasa a ser una línea de contexto
 * dentro de la franja de "estado del evento", junto a la cuenta atrás.
 */
export default function EventHubPage() {
  const reduceMotion = useReducedMotion() ?? false;

  const [loading, setLoading] = useState(true);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [revealedPhotoUrls, setRevealedPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    getEventConfig()
      .then((config) => {
        if (active) setEventConfig(config);
      })
      .catch(() => {
        if (active) setEventConfig(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // Un fallo acá no bloquea la cartelera -- el número simplemente no se
    // muestra (ver EventStatusStrip más abajo), igual que posts/rollo.
    getPublicHeadcount()
      .then((count) => {
        if (active) setHeadcount(count);
      })
      .catch(() => {
        if (active) setHeadcount(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listPublishedPosts()
      .then((found) => {
        if (active) setPosts(found);
      })
      .catch(() => {
        if (active) setPosts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!eventConfig?.photosRevealedAt) {
      setRevealedPhotoUrls([]);
      return;
    }
    listRevealedPhotos()
      .then(async (photos: Photo[]) => {
        const urls = await Promise.all(photos.map((p) => getSignedPhotoUrl(p.storagePath).catch(() => null)));
        if (active) setRevealedPhotoUrls(urls.filter((u): u is string => u !== null));
      })
      .catch(() => {
        if (active) setRevealedPhotoUrls([]);
      });
    return () => {
      active = false;
    };
  }, [eventConfig?.photosRevealedAt]);

  if (loading) {
    return <HubLoading reduceMotion={reduceMotion} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 px-4 pb-16 pt-8">
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-laser-500/20 blur-[90px]"
        aria-hidden
      />
      <div className="film-grain pointer-events-none absolute inset-0 opacity-[0.03]" aria-hidden />

      <div className="relative mx-auto flex max-w-md flex-col gap-5">
        <header className="flex flex-col gap-1 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">La cartelera // abierto para todos</span>
          <h1 className="font-display text-4xl uppercase leading-none tracking-wide text-paper-100">
            {eventConfig?.eventName ?? 'El evento'}
          </h1>
        </header>

        <EventStatusStrip eventDate={eventConfig?.eventDate ?? null} headcount={headcount} />

        <AnnouncementFeed posts={posts} />

        <RevealedRoll photoUrls={revealedPhotoUrls} />
      </div>
    </div>
  );
}

function HubLoading({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950 text-center">
      <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Cargando la cartelera...</span>
      <motion.h1
        className="font-display text-3xl uppercase tracking-wide text-paper-100"
        animate={reduceMotion ? { opacity: 1 } : { opacity: [0.2, 1, 0.3, 1, 1] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.9, times: [0, 0.3, 0.5, 0.7, 1] }}
      >
        Encendiendo el letrero...
      </motion.h1>
    </div>
  );
}

/**
 * EventStatusStrip — franja de contexto (Etapa 5, Parte D): fusiona lo que
 * antes eran `DoorCountdown` y `PublicTally` en dos líneas de una misma
 * franja. Es información de contexto, no el centro de la página -- por eso
 * el aforo ya no tiene número gigante en Display, solo un chip a la derecha
 * de la cuenta atrás. Sigue mostrando un único número, nunca nombres.
 */
function EventStatusStrip({ eventDate, headcount }: { eventDate: string | null; headcount: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const countdown = (() => {
    if (!eventDate) {
      return { started: false, label: 'Por confirmar' };
    }
    const eventMs = new Date(eventDate).getTime();
    const remainingMs = eventMs - now;
    const started = remainingMs <= 0;
    const daysRemaining = Math.floor(remainingMs / 86_400_000);
    const hoursRemaining = Math.floor((remainingMs % 86_400_000) / 3_600_000);
    return {
      started,
      label: started ? 'Ya se prendieron las luces' : `Faltan ${daysRemaining}d ${hoursRemaining}h para el show`,
    };
  })();

  return (
    <section
      className="flex flex-col gap-2 border border-smoke-700/50 bg-ink-900 px-3 py-2"
      aria-label="Estado del evento"
    >
      <div
        className={`flex items-center justify-between font-mono text-[11px] uppercase tracking-widest ${
          countdown.started ? 'text-acid-400' : 'text-laser-500'
        }`}
      >
        <span>{countdown.started ? 'En vivo' : 'Última llamada'}</span>
        <span className="font-bold">{countdown.label}</span>
      </div>
      {headcount !== null && (
        <div className="flex items-center justify-between border-t border-smoke-700/40 pt-2 font-mono text-[11px] uppercase tracking-widest text-hotpink-500">
          <span>Aforo // en la lista</span>
          <span className="flex items-baseline gap-1">
            <span className="font-display text-base font-bold leading-none text-acid-400">{headcount}</span>
            <span className="text-paper-100/70">confirmados</span>
          </span>
        </div>
      )}
    </section>
  );
}
