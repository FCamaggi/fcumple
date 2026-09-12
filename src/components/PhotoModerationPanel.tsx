import { useEffect, useState } from 'react';
import { listAllPhotosForModeration, moderatePhoto, getSignedPhotoUrl, type ModerationPhoto } from '../lib/photosApi';
import { revealPhotos } from '../lib/eventApi';

/**
 * PhotoModerationPanel -- panel de admin para la galería (DESIGN.md §7.9,
 * docs/BACKLOG.md Etapa 2). Mismo patrón colapsable que PostsPanel/
 * EventSettingsForm: cola de fotos `pending` con miniatura, nombre del
 * invitado y aprobar/rechazar, más el botón de un solo sentido "Revelar el
 * rollo".
 */
export default function PhotoModerationPanel() {
  const [photos, setPhotos] = useState<ModerationPhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let active = true;
    listAllPhotosForModeration()
      .then((all) => {
        if (!active) return;
        const pending = all.filter((p) => p.status === 'pending');
        setPhotos(pending);
        pending.forEach((p) => {
          getSignedPhotoUrl(p.storagePath)
            .then((url) => {
              if (active) setThumbUrls((prev) => ({ ...prev, [p.id]: url }));
            })
            .catch(() => {
              /* la miniatura simplemente no aparece; el resto de la fila sigue usable */
            });
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleModerate(id: string, status: 'approved' | 'rejected') {
    setError(null);
    try {
      await moderatePhoto(id, status);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos actualizar la foto.');
    }
  }

  async function handleReveal() {
    if (!window.confirm('¿Revelar el rollo? Esta acción no se puede deshacer para este evento.')) return;
    setError(null);
    try {
      await revealPhotos();
      setRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos revelar el rollo.');
    }
  }

  return (
    <section className="flex flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">
          Fotos // cola de moderación
        </span>
        <button
          type="button"
          onClick={handleReveal}
          disabled={revealed}
          className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revealed ? 'Rollo revelado' : 'Revelar el rollo'}
        </button>
      </div>

      {error && <p className="font-mono text-[11px] uppercase tracking-wider text-flame-500">{error}</p>}

      {loading ? (
        <span className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">Cargando...</span>
      ) : photos.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
          No hay fotos pendientes de moderación.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {photos.map((photo) => (
            <li key={photo.id} className="flex items-center gap-3 bg-ink-950 p-3">
              {thumbUrls[photo.id] ? (
                <img src={thumbUrls[photo.id]} alt="" className="h-16 w-16 shrink-0 object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 bg-smoke-700/30" aria-hidden />
              )}
              <div className="flex flex-1 flex-col">
                <span className="font-sans text-sm font-bold text-paper-100">{photo.guestFullName}</span>
                <span className="font-mono text-[10px] text-paper-100/70">{photo.storagePath}</span>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleModerate(photo.id, 'approved')}
                  className="border border-smoke-700/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-acid-400 transition-colors hover:bg-acid-400/10"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => handleModerate(photo.id, 'rejected')}
                  className="border border-smoke-700/50 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-flame-500 transition-colors hover:bg-flame-500/10"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
