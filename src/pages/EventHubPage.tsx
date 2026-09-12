import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getEventConfig, getPublicHeadcount } from '../lib/eventApi';
import { listPublishedPosts } from '../lib/postsApi';
import { getSignedPhotoUrl, listRevealedPhotos } from '../lib/photosApi';
import AnnouncementTicker from '../components/AnnouncementTicker';
import RevealedRoll from '../components/RevealedRoll';
import type { EventConfig, Photo, Post } from '../types';

/**
 * `/evento` — el hub público (docs/BACKLOG.md, Decisión 4.3). Es la
 * cartelera del club: cuenta atrás para la fiesta, los avisos, y el rollo
 * revelado, todo sin token ni login -- 100% abierto, coherente con el tono
 * ya establecido para el QR de puerta. El único dato de "quién va" que se
 * expone es un número (`getPublicHeadcount`), nunca nombres.
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
    // muestra (ver PublicTally más abajo), igual que posts/rollo.
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

      <div className="relative mx-auto flex max-w-md flex-col gap-4">
        <header className="flex flex-col gap-1 text-center">
          <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">La cartelera // abierto para todos</span>
          <h1 className="font-display text-4xl uppercase leading-none tracking-wide text-paper-100">
            {eventConfig?.eventName ?? 'El evento'}
          </h1>
        </header>

        <DoorCountdown eventDate={eventConfig?.eventDate ?? null} />

        <PublicTally headcount={headcount} />

        <AnnouncementTicker posts={posts} />

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
 * DoorCountdown — cuenta atrás a `eventConfig.eventDate`. Distinto de
 * `RsvpDeadlineStrip` (que cuenta hasta el `rsvp_deadline`): esto es "cuánto
 * falta para la fiesta", visible para cualquiera con el link al hub.
 */
function DoorCountdown({ eventDate }: { eventDate: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!eventDate) {
    return (
      <div className="flex items-center justify-between border border-smoke-700/50 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-paper-100/70">
        <span>Fecha</span>
        <span>Por confirmar</span>
      </div>
    );
  }

  const eventMs = new Date(eventDate).getTime();
  const remainingMs = eventMs - now;
  const started = remainingMs <= 0;
  const daysRemaining = Math.floor(remainingMs / 86_400_000);
  const hoursRemaining = Math.floor((remainingMs % 86_400_000) / 3_600_000);

  return (
    <div
      className={`flex items-center justify-between border px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
        started ? 'border-acid-400/50 text-acid-400' : 'border-smoke-700/50 text-laser-500'
      }`}
    >
      <span>{started ? 'En vivo' : 'Última llamada'}</span>
      <span className="font-bold">
        {started ? 'Ya se prendieron las luces' : `Faltan ${daysRemaining}d ${hoursRemaining}h para el show`}
      </span>
    </div>
  );
}

/**
 * PublicTally — la versión pública del `HeadcountMeter`: mismo lenguaje
 * visual (número gigante en Display), pero sin barras ni desagregado por
 * estado -- acá solo importa "cuántos van", nunca quiénes.
 */
function PublicTally({ headcount }: { headcount: number | null }) {
  if (headcount === null) return null;

  return (
    <section className="flex flex-col items-center gap-1 bg-ink-900 p-6 shadow-2xl" aria-label="Aforo público">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
        Aforo // en la lista
      </span>
      <span className="font-display text-6xl leading-none text-acid-400">{headcount}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-paper-100/70">
        confirmados hasta ahora
      </span>
    </section>
  );
}
