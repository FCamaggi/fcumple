import FilmRollCounter from './FilmRollCounter';
import type { PhotoQuota } from '../types';

interface CameraSectionProps {
  quota: PhotoQuota;
  onOpen: () => void;
}

// Card liviano dentro del scroll normal de la página -- la cámara en sí
// (docs/fase-0-evento-unico/04-producto/BACKLOG.md Etapa 8) es una experiencia
// a pantalla completa que sólo se monta cuando el invitado la abre a
// propósito. Compartido por GuestPage (Fase 0) y GuestHub (Fase 1).
export default function CameraSection({ quota, onOpen }: CameraSectionProps) {
  const remaining = Math.max(0, quota.quota - quota.used);
  const outOfShots = remaining <= 0;

  return (
    <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Cámara">
      <span className="font-mono text-xs font-bold uppercase tracking-wider text-hotpink-500">
        Cámara // modo carrete
      </span>
      <FilmRollCounter quota={quota.quota} used={quota.used} />
      {outOfShots ? (
        <p className="font-sans text-sm text-paper-100/70">
          Se acabó tu rollo. Ya diste todos tus disparos para esta noche.
        </p>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="tap-target h-14 font-display text-lg uppercase tracking-wider bg-hotpink-500 text-ink-950 shadow-glow-hotpink transition-all active:scale-[0.98]"
        >
          Abrir cámara
        </button>
      )}
    </section>
  );
}
