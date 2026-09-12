interface RevealedRollProps {
  photoUrls: string[];
}

/**
 * RevealedRoll — DESIGN.md §1/§7.9, extraído de GuestPage (era una función
 * interna ahí) para poder mostrarlo también en el hub público `/evento`
 * (docs/BACKLOG.md, Decisión 4.3). Nadie ve el rollo -- ni siquiera sus
 * propias fotos -- antes de que el admin lo revele; ese gate vive en quien
 * llama a este componente (photosRevealedAt + fotos ya cargadas), no acá.
 */
export default function RevealedRoll({ photoUrls }: RevealedRollProps) {
  if (photoUrls.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 bg-ink-900 p-4 shadow-2xl" aria-label="Rollo revelado">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-acid-400">
        Rollo revelado // esta fue la noche
      </span>
      <div className="grid grid-cols-3 gap-1">
        {photoUrls.map((url) => (
          <img key={url} src={url} alt="" className="aspect-square w-full object-cover" />
        ))}
      </div>
    </section>
  );
}
