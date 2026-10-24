import { useMemo, useState } from 'react';
import PhotoModerationPanel from './PhotoModerationPanel';
import { useEventPhotos } from '../hooks/useEventPhotos';
import type { CameraUnlock, OrganizerEvent, OrganizerGuest } from '../lib/organizerApi';
import { summarizeCamera } from '../lib/partyDay';

export type PartyDayShortcut = 'fotos' | 'activacion' | 'invitados';

interface PartyDayTabProps {
  event: OrganizerEvent;
  guests: OrganizerGuest[];
  onEventChange: (event: OrganizerEvent) => void;
  /** Lleva a otra pestaña del panel (los atajos de esta). */
  onOpenTab: (tab: PartyDayShortcut) => void;
}

const MAX_LISTED = 8;

const HOW_ACTIVATED: Record<CameraUnlock, string> = {
  on_event_qr: 'Activan la cámara escaneando el QR del evento.',
  on_checkin: 'La cámara se activa al entrar por la puerta.',
  on_identify: 'La cámara se activa al inscribirse.',
};

const card = 'flex flex-col gap-3 border border-smoke-700/50 bg-ink-900 p-4 shadow-2xl';
const label = 'font-mono text-xs uppercase tracking-widest text-acid-400';
const primary = 'h-11 bg-acid-400 px-5 font-display text-sm uppercase tracking-wider text-ink-950';
const secondary =
  'h-11 border border-acid-400 px-5 font-display text-sm uppercase tracking-wider text-acid-400 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * «Hoy» — lo del día de la fiesta a un toque, pensado para el celular: cuántas fotos faltan por revisar (con la
 * revisión y la publicación del lote ahí mismo) y quiénes ya activaron la cámara. Solo muestra y atajos: no guarda
 * nada propio, usa lo mismo que las pestañas «Fotos», «Activación» e «Invitados».
 */
export default function PartyDayTab({ event, guests, onEventChange, onOpenTab }: PartyDayTabProps) {
  const [moderating, setModerating] = useState(false);
  const { photos, counts, error, notice, publishing, reload, handlePublish, source } = useEventPhotos(
    event,
    onEventChange,
    moderating ? 1 : 0,
  );
  const camera = useMemo(() => summarizeCamera(event.cameraUnlock, guests), [event.cameraUnlock, guests]);
  const listed = camera.missing.slice(0, MAX_LISTED);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Fotos" className={card}>
        <span className={label}>Fotos // por revisar</span>

        {photos === null && !error && (
          <p role="status" className="font-mono text-xs uppercase tracking-widest text-paper-100/70">
            Cargando fotos...
          </p>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="font-mono text-xs uppercase tracking-wide text-flame-500">
              {error}
            </p>
            <button type="button" onClick={reload} className={secondary}>
              Reintentar
            </button>
          </div>
        )}

        {photos !== null && photos.length === 0 && (
          <p className="font-sans text-sm text-paper-100/80">Todavía no llegan fotos. Aparecerán aquí cuando los invitados las tomen.</p>
        )}

        {photos !== null && photos.length > 0 && (
          <>
            <p className="font-display text-3xl uppercase tracking-wide">{counts.pending} por revisar</p>
            <p className="font-sans text-sm text-paper-100/80">
              {counts.unpublished} aprobada(s) sin publicar · {counts.approved} aprobadas · {counts.rejected} rechazadas
            </p>
            {notice && (
              <p role="status" className="font-mono text-xs uppercase tracking-wide text-acid-400">
                {notice}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {counts.pending > 0 && (
                <button type="button" onClick={() => setModerating(true)} className={primary}>
                  Revisar {counts.pending} foto(s)
                </button>
              )}
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishing || counts.unpublished === 0}
                className={secondary}
              >
                {publishing ? 'Publicando...' : `Publicar ${counts.unpublished} aprobada(s)`}
              </button>
            </div>
          </>
        )}
      </section>

      <section aria-label="Cámara" className={card}>
        <span className={label}>Cámara // quién la activó</span>

        {camera.total === 0 ? (
          <p className="font-sans text-sm text-paper-100/80">Todavía no hay invitados aprobados.</p>
        ) : (
          <>
            <p className="font-display text-3xl uppercase tracking-wide">
              {camera.activated} de {camera.total} activaron la cámara
            </p>
            <p className="font-sans text-sm text-paper-100/80">{HOW_ACTIVATED[event.cameraUnlock]}</p>
            {camera.missing.length === 0 ? (
              <p className="font-mono text-xs uppercase tracking-wide text-acid-400">Todos tienen la cámara.</p>
            ) : (
              <ul className="flex flex-col gap-1 font-sans text-sm" aria-label="Les falta activar la cámara">
                {listed.map((g) => (
                  <li key={g.id} data-testid="missing-guest">
                    {g.fullName}
                  </li>
                ))}
                {camera.missing.length > listed.length && (
                  <li className="text-paper-100/70">y {camera.missing.length - listed.length} más</li>
                )}
              </ul>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {event.cameraUnlock === 'on_event_qr' && (
            <button type="button" onClick={() => onOpenTab('activacion')} className={primary}>
              Mostrar el QR
            </button>
          )}
          <button type="button" onClick={() => onOpenTab('invitados')} className={secondary}>
            Ver invitados
          </button>
        </div>
      </section>

      {moderating && <PhotoModerationPanel onClose={() => setModerating(false)} source={source} />}
    </div>
  );
}
