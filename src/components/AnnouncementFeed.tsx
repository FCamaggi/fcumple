import { useEffect, useState } from 'react';
import { listPostImages, getPostImageUrl } from '../lib/postsApi';
import type { Post, PostImage } from '../types';

interface AnnouncementFeedProps {
  posts: Post[];
}

/**
 * AnnouncementFeed — reemplaza a `AnnouncementTicker` (DESIGN.md §7.8):
 * ahora que un post puede traer subtítulo, imagen destacada y galería, una
 * marquesina de solo-título ya no alcanza para mostrarlos. Sigue siendo la
 * cartelera del club, no un feed de blog genérico: tarjetas de borde duro
 * en `ink-900`, sin sombra suave ni esquinas redondeadas (lista negra
 * DESIGN.md §3), con el cuerpo completo (son pocos avisos, no hace falta
 * truncar ni paginar) y cuándo se publicó en tiempo relativo.
 *
 * Etapa 14 (QA manual, feedback de usuario): el orden (más nuevo arriba) no
 * cambia -- leer de abajo hacia arriba YA es cronológico -- pero eso no era
 * evidente sin una pista visual, así que se agrega un riel vertical tipo
 * línea de tiempo (spine) con un marcador cuadrado duro por tarjeta, más un
 * timestamp absoluto ("10 MAY · 09:00", horario America/Santiago, mismo
 * criterio de `lib/photoTimeline.ts`) junto al relativo que ya existía.
 */
export default function AnnouncementFeed({ posts }: AnnouncementFeedProps) {
  if (posts.length === 0) return null;

  const ordered = [...posts].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <section className="flex flex-col gap-3" aria-label="Avisos del evento">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500">
        On air // avisos
      </span>
      <div className="relative flex flex-col gap-4 pl-5">
        <div aria-hidden="true" className="absolute bottom-1 left-1 top-1 w-px bg-smoke-700/60" />
        {ordered.map((post) => (
          <AnnouncementCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

function AnnouncementCard({ post }: { post: Post }) {
  const [galleryImages, setGalleryImages] = useState<PostImage[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // path -> signed url ya resuelta, para no volver a pedir la misma firma
  // por cada render mientras el componente sigue montado.
  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    listPostImages(post.id)
      .then((images) => {
        if (active) setGalleryImages(images);
      })
      .catch(() => {
        if (active) setGalleryImages([]);
      });
    return () => {
      active = false;
    };
  }, [post.id]);

  // getPostImageUrl es async (createSignedUrl contra el bucket privado
  // post-images) -- no se puede usar directo como `src` de un <img>.
  useEffect(() => {
    let active = true;
    if (!post.coverImagePath) {
      setCoverUrl(null);
      return;
    }
    getPostImageUrl(post.coverImagePath)
      .then((url) => {
        if (active) setCoverUrl(url);
      })
      .catch(() => {
        if (active) setCoverUrl(null);
      });
    return () => {
      active = false;
    };
  }, [post.coverImagePath]);

  useEffect(() => {
    let active = true;
    Promise.all(
      galleryImages.map((img) =>
        getPostImageUrl(img.storagePath)
          .then((url) => [img.storagePath, url] as const)
          .catch(() => [img.storagePath, null] as const),
      ),
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const [path, url] of entries) {
        if (url) next[path] = url;
      }
      setGalleryUrls(next);
    });
    return () => {
      active = false;
    };
  }, [galleryImages]);

  return (
    <article className="relative flex flex-col gap-2 border border-smoke-700/50 bg-ink-900 p-4 shadow-xl">
      <span
        aria-hidden="true"
        className="absolute -left-[22px] top-5 h-2 w-2 -translate-y-1/2 bg-laser-500"
      />
      {coverUrl && (
        <img src={coverUrl} alt={post.title} className="aspect-video w-full object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-xl uppercase leading-tight text-paper-100">{post.title}</h3>
        <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-wider text-paper-100/50">
          <span>{formatAbsoluteTime(post.publishedAt)}</span>
          <span>{formatRelativeTime(post.publishedAt)}</span>
        </span>
      </div>
      {post.subtitle && (
        <p className="font-mono text-xs uppercase tracking-wider text-laser-500">{post.subtitle}</p>
      )}
      <p className="whitespace-pre-wrap font-sans text-sm text-paper-100/90">{post.body}</p>
      {galleryImages.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {galleryImages.map(
            (img) =>
              galleryUrls[img.storagePath] && (
                <img
                  key={img.id}
                  src={galleryUrls[img.storagePath]}
                  alt="Foto de galería"
                  className="aspect-square w-full object-cover"
                />
              ),
          )}
        </div>
      )}
    </article>
  );
}

// Mismo criterio que `chileDateAndHour` en lib/photoTimeline.ts: horario de
// América/Santiago vía Intl (resuelve el offset correcto, cambio de horario
// de verano incluido, sin cálculo manual), armado a mano como
// "10 MAY · 09:00" -- el timestamp absoluto que responde "cuándo se subió
// cada cosa" (feedback QA), complementario al relativo de abajo.
const absoluteTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return '';
  const parts = absoluteTimeFormatter.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month').replace('.', '')} · ${get('hour')}:${get('minute')}`;
}

// "hace {N}{unit}": minutos hasta 59, horas hasta 23, después días. No usa
// una librería nueva -- son pocos posts, no hace falta más precisión que
// esto para transmitir "hace cuánto salió este aviso".
function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'recién';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'hace instantes';
  if (minutes < 60) return `hace ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;

  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
