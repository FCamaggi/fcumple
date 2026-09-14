import { useEffect, useState } from 'react';
import { getSignedPhotoDownloadUrl, getSignedPhotoUrl } from '../lib/photosApi';
import { groupPhotosByHourBand, type PhotoTimelineBand } from '../lib/photoTimeline';

export interface RawRevealedPhoto {
  storagePath: string;
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
 * ve en el preview), y el resto recién cuando el usuario expande esa banda
 * puntual. Una banda con `PREVIEW_SIZE` fotos o menos no tiene nada que
 * expandir, así que queda "expandida" desde el inicio.
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
  const restPhotos = band.photos.slice(PREVIEW_SIZE);
  const needsExpansion = restPhotos.length > 0;

  const [expanded, setExpanded] = useState(!needsExpansion);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Preview: se resuelven las primeras PREVIEW_SIZE fotos apenas la banda
  // aparece, sin esperar ninguna interacción del usuario.
  useEffect(() => {
    let active = true;
    Promise.all(
      previewPhotos.map(async (photo) => {
        const url = await getSignedPhotoUrl(photo.storagePath).catch(() => null);
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

  async function handleExpand() {
    setExpanded(true);
    const entries = await Promise.all(
      restPhotos.map(async (photo) => {
        const url = await getSignedPhotoUrl(photo.storagePath).catch(() => null);
        return [photo.storagePath, url] as const;
      }),
    );
    setUrls((prev) => ({
      ...prev,
      ...Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null)),
    }));
  }

  const visiblePhotos = expanded ? band.photos : previewPhotos;

  return (
    <div className="flex flex-col gap-1">
      {needsExpansion && !expanded ? (
        <button
          type="button"
          onClick={handleExpand}
          className="text-left font-mono text-[10px] uppercase tracking-widest text-paper-100/50 underline decoration-dotted underline-offset-2"
        >
          {band.label} · Ver las {band.photos.length} fotos
        </button>
      ) : (
        <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/50">{band.label}</span>
      )}
      <div className="grid grid-cols-3 gap-1">
        {visiblePhotos.map((photo) => {
          const url = urls[photo.storagePath];
          if (!url) return null;
          return (
            <PhotoTile key={photo.storagePath} url={url} storagePath={photo.storagePath} downloadable={expanded} />
          );
        })}
      </div>
    </div>
  );
}

function PhotoTile({ url, storagePath, downloadable }: { url: string; storagePath: string; downloadable: boolean }) {
  async function handleDownload() {
    const downloadUrl = await getSignedPhotoDownloadUrl(storagePath).catch(() => null);
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="relative">
      <img src={url} alt="" className="aspect-square w-full object-cover" />
      {downloadable && (
        <button
          type="button"
          onClick={handleDownload}
          className="absolute bottom-1 right-1 bg-ink-950/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-paper-100"
        >
          Descargar
        </button>
      )}
    </div>
  );
}
