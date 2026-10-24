import { useEffect, useMemo, useRef, useState } from 'react';
import { getSignedPhotoUrl } from '../lib/photosApi';
import PhotoLightbox from './PhotoLightbox';
import type { RawRevealedPhoto } from './RevealedRoll';

const MAX_PHOTOS = 10;

/**
 * Cartelera de fotos: las últimas fotos que la organizadora ya publicó, en un carrusel que se desliza con el
 * dedo (scroll-snap, sin librería). Máximo 10 y con carga diferida: cada foto pide su URL firmada solo cuando
 * está por entrar en pantalla, y siempre la copia liviana (`display`) si existe; el original queda para el
 * visor y la descarga. Tocar una foto abre el visor existente con todas las del carrusel.
 */
export default function PhotoCarousel({ photos }: { photos: RawRevealedPhoto[] }) {
  const latest = useMemo(
    () => [...photos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_PHOTOS),
    [photos],
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (latest.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-label="Fotos de la fiesta">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500">
        Fotos de la fiesta // lo último
      </span>
      <ul
        tabIndex={0}
        aria-label="Carrusel de fotos"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400"
      >
        {latest.map((photo, i) => (
          <Slide key={photo.storagePath} photo={photo} index={i} total={latest.length} onOpen={() => setLightboxIndex(i)} />
        ))}
      </ul>
      <p className="font-mono text-[10px] uppercase tracking-widest text-paper-100/50">
        {latest.length} de {photos.length} fotos · desliza para ver más
      </p>
      {lightboxIndex !== null && (
        <PhotoLightbox photos={latest} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </section>
  );
}

function Slide({
  photo,
  index,
  total,
  onOpen,
}: {
  photo: RawRevealedPhoto;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Sin IntersectionObserver (navegadores muy viejos), las primeras fotos cargan de inmediato.
  useEffect(() => {
    const node = ref.current;
    if (typeof IntersectionObserver === 'undefined' || !node) {
      setVisible(index < 3);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 240px 0px 240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [index]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    getSignedPhotoUrl(photo.displayStoragePath ?? photo.storagePath)
      .then((signed) => active && setUrl(signed))
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [visible, photo.displayStoragePath, photo.storagePath]);

  return (
    <li ref={ref} className="aspect-[4/5] w-[78%] max-w-xs shrink-0 snap-center bg-ink-900">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver foto ${index + 1} de ${total}`}
        className="block h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-400"
      >
        {url && <img src={url} alt={`Foto ${index + 1} de la fiesta`} className="h-full w-full object-cover" loading="lazy" />}
      </button>
    </li>
  );
}
