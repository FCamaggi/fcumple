import { useEffect, useState } from 'react';
import { getSignedPhotoUrl } from '../lib/photosApi';
import { groupPhotosByHourBand, type PhotoTimelineBand } from '../lib/photoTimeline';
import PhotoLightbox from './PhotoLightbox';

export interface RawRevealedPhoto {
  storagePath: string;
  /**
   * Bandwidth-friendly copy for on-screen viewing (Etapa 15) -- `null` for
   * photos uploaded before this feature existed, or when generating it
   * failed. Preview thumbnails prefer this over `storagePath`; the download
   * button (in PhotoLightbox) always uses `storagePath` regardless.
   */
  displayStoragePath: string | null;
  createdAt: string;
}

interface RevealedRollProps {
  photos: RawRevealedPhoto[];
}

const PREVIEW_SIZE = 3;

/**
 * RevealedRoll — DESIGN.md §1/§7.9, extraído de GuestPage (era una función
 * interna ahí) para poder mostrarlo también en el hub público `/evento`
 * (docs/BACKLOG.md, Decisión 4.3). Nadie ve el rollo -- ni siquiera sus
 * propias fotos -- antes de que el admin lo revele; ese gate vive en quien
 * llama a este componente (photosRevealedAt + fotos ya cargadas), no acá.
 *
 * Etapa 9, Frente 3: las fotos se agrupan en bandas de 1 hora alineadas al
 * reloj en horario de Chile (`groupPhotosByHourBand`, `lib/photoTimeline.ts`)
 * -- "la noche contada en orden", de más temprano a más tarde.
 *
 * Etapa 10: `EventHubPage` ya no resuelve URLs firmadas eagerly para todas
 * las fotos -- pasa a `RevealedRoll` los datos crudos (`storagePath` +
 * `createdAt`) y este componente resuelve URLs de a poco, banda por banda:
 * solo las primeras `PREVIEW_SIZE` fotos de cada banda al montar (lo que se
 * ve en el preview).
 *
 * Etapa 14 (QA manual, feedback de usuario): "Ver las N fotos" ya no expande
 * el grid en línea -- abre `PhotoLightbox`, un visor fullscreen de a una
 * foto por vez con navegación y un único botón de descarga para la foto que
 * se está viendo. Tocar cualquier thumbnail del preview también abre el
 * visor, arrancando en esa foto.
 */
export default function RevealedRoll({ photos }: RevealedRollProps) {
  if (photos.length === 0) return null;

  const bands = groupPhotosByHourBand(photos);

  return (
    <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Rollo revelado">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400">
        Rollo revelado // esta fue la noche
      </span>
      <div className="flex flex-col gap-3">
        {bands.map((band) => (
          <HourBand key={band.label} band={band} />
        ))}
      </div>
    </section>
  );
}

function HourBand({ band }: { band: PhotoTimelineBand<RawRevealedPhoto> }) {
  const previewPhotos = band.photos.slice(0, PREVIEW_SIZE);
  const hasMore = band.photos.length > PREVIEW_SIZE;

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Preview: se resuelven las primeras PREVIEW_SIZE fotos apenas la banda
  // aparece, sin esperar ninguna interacción del usuario.
  useEffect(() => {
    let active = true;
    Promise.all(
      previewPhotos.map(async (photo) => {
        // Etapa 15: prefiere la copia "display" (más liviana) para el
        // preview del grid, cayendo al original si esta foto no tiene una
        // (subida antes de la feature, o cuya generación falló).
        const url = await getSignedPhotoUrl(photo.displayStoragePath ?? photo.storagePath).catch(() => null);
        return [photo.storagePath, url] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setUrls((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null)),
      }));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band.label]);

  return (
    <div className="flex flex-col gap-1">
      {hasMore ? (
        <button
          type="button"
          onClick={() => setLightboxIndex(0)}
          className="text-left font-mono text-[10px] uppercase tracking-widest text-paper-100/50 underline decoration-dotted underline-offset-2"
        >
          {band.label} · Ver las {band.photos.length} fotos
        </button>
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/50">{band.label}</span>
      )}
      <div className="grid grid-cols-3 gap-1">
        {previewPhotos.map((photo, i) => {
          const url = urls[photo.storagePath];
          if (!url) return null;
          return (
            <button
              key={photo.storagePath}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Ver foto ${i + 1} de la banda ${band.label}`}
              className="block"
            >
              <img src={url} alt="" className="aspect-square w-full object-cover" />
            </button>
          );
        })}
      </div>
      {lightboxIndex !== null && (
        <PhotoLightbox photos={band.photos} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
