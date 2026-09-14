import { groupPhotosByHourBand, type TimelinePhoto } from '../lib/photoTimeline';

interface RevealedRollProps {
  photos: TimelinePhoto[];
}

/**
 * RevealedRoll — DESIGN.md §1/§7.9, extraído de GuestPage (era una función
 * interna ahí) para poder mostrarlo también en el hub público `/evento`
 * (docs/BACKLOG.md, Decisión 4.3). Nadie ve el rollo -- ni siquiera sus
 * propias fotos -- antes de que el admin lo revele; ese gate vive en quien
 * llama a este componente (photosRevealedAt + fotos ya cargadas), no acá.
 *
 * Etapa 9, Frente 3: las fotos se agrupan en bandas de 1 hora alineadas al
 * reloj en horario de Chile (`groupPhotosByHourBand`, `lib/photoTimeline.ts`)
 * -- "la noche contada en orden", de más temprano a más tarde. El grid de 3
 * columnas dentro de cada banda queda igual que antes.
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
          <div key={band.label} className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/50">{band.label}</span>
            <div className="grid grid-cols-3 gap-1">
              {band.photos.map((photo) => (
                <img key={photo.url} src={photo.url} alt="" className="aspect-square w-full object-cover" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
