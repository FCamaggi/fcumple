import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { getGuestByToken, submitRsvp } from '../lib/guestApi';
import { getEventConfig } from '../lib/eventApi';
import { getPhotoQuota } from '../lib/photosApi';
import { DEV_GUEST_TOKEN } from '../lib/devGuest';
import type { FaderValue } from '../components/FaderToggle';
import WristbandCard from '../components/WristbandCard';
import FaderToggle from '../components/FaderToggle';
import RsvpDeadlineStrip from '../components/RsvpDeadlineStrip';
import SignalToast from '../components/SignalToast';
import CameraCapture from '../components/CameraCapture';
import type { EventConfig, EventInfo, Guest, PhotoQuota, RsvpStatus } from '../types';

// DevPanel (y la librería de generación de QR que usa) solo le sirven al
// invitado de prueba fijo (DEV_GUEST_TOKEN) -- se carga lazy para que el
// 99.9% de invitados reales nunca la descarguen, mismo criterio que
// App.tsx usa para separar /admin en su propio chunk.
const DevPanel = lazy(() => import('../components/DevPanel'));

// DoorQrOverlay (y la librería de QR) solo se descargan cuando el invitado
// realmente toca "Mostrar mi QR" -- no en la carga inicial de /i/:token.
const DoorQrOverlay = lazy(() => import('../components/DoorQrOverlay'));

const NOT_SET = 'Por confirmar';

// WristbandCard/HeadcountMeter still expect the richer EventInfo shape.
// event_config only carries a subset of those fields, so anything it
// doesn't have degrades to a neutral placeholder instead of crashing on
// `undefined` or leaking a raw null into the UI.
function toEventInfo(config: EventConfig | null): EventInfo {
  return {
    name: config?.eventName ?? NOT_SET,
    tagline: '',
    date: config?.eventDate ? formatEventDate(config.eventDate) : NOT_SET,
    doorsTime: config?.eventDate ? formatDoorsTime(config.eventDate) : NOT_SET,
    rsvpDeadline: config?.rsvpDeadline ?? '',
    venueName: config?.location ?? NOT_SET,
    venueAddress: '',
    dresscode: config?.theme ?? NOT_SET,
    lineup: '',
    capacityTotal: 0,
  };
}

function formatEventDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}

// El admin solo ingresa una fecha+hora completa (event_config.event_date,
// ver EventSettingsForm.tsx) -- no hay un campo separado de "horario de
// puertas". La hora real vive ahí; formatEventDate() ya la separa de la
// fecha (sin hour/minute) así que esta función es la única que la muestra.
function formatDoorsTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const STATUS_TO_FADER: Record<RsvpStatus, FaderValue> = {
  confirmed: 'yes',
  declined: 'no',
  pending: 'neutral',
};

export default function GuestPage() {
  const { token } = useParams<{ token: string }>();
  const reduceMotion = useReducedMotion() ?? false;

  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [photoQuota, setPhotoQuota] = useState<PhotoQuota | null>(null);

  const [editing, setEditing] = useState(false);
  const [fader, setFader] = useState<FaderValue>('neutral');
  const [plusOne, setPlusOne] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let active = true;

    getGuestByToken(token ?? '')
      .then((found) => {
        if (!active) return;
        if (!found) {
          setInvalid(true);
          return;
        }
        setGuest(found);
        setFader(STATUS_TO_FADER[found.status]);
        setPlusOne(found.plusOnesConfirmed);
        setNote(found.guestNote ?? '');
      })
      .catch(() => {
        if (active) setInvalid(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;

    // The event may genuinely not be configured yet (pre-launch), so a
    // failed/empty fetch here just leaves eventConfig as null — the UI
    // degrades gracefully instead of treating it like an invalid token.
    getEventConfig()
      .then((config) => {
        if (active) setEventConfig(config);
      })
      .catch(() => {
        if (active) setEventConfig(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    // Same degrade-gracefully criterion as eventConfig/posts above: the
    // camera section is a bonus surface, not the guest's core task (RSVP).
    // A failed fetch just leaves photoQuota null and the section hides
    // itself instead of surfacing an error.
    getPhotoQuota(token ?? '')
      .then((quota) => {
        if (active) setPhotoQuota(quota);
      })
      .catch(() => {
        if (active) setPhotoQuota(null);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const event = toEventInfo(eventConfig);

  if (invalid || (!loading && !guest)) {
    return <InvalidTokenScreen token={token} />;
  }

  // DevPanel opera directo sobre el invitado de prueba por afuera del flujo
  // normal de RSVP -- hay que resincronizar el mismo estado local que el
  // efecto de carga inicial deriva de `guest`, si no el fader/+1/nota
  // quedarían mostrando la respuesta vieja después de que el panel cambie
  // el estado en la base.
  function handleDevGuestChange(updated: Guest) {
    setGuest(updated);
    setFader(STATUS_TO_FADER[updated.status]);
    setPlusOne(updated.plusOnesConfirmed);
    setNote(updated.guestNote ?? '');
    setEditing(false);
  }

  // Cerrar el QR de puerta es la única señal que tenemos de "puede haber
  // pasado algo en el mundo real mientras estaba abierto" (te escanearon).
  // Por eso vuelve a pedir el guest y el cupo de fotos en vez de confiar en
  // lo que ya había en memoria -- si te marcaron checked-in mientras lo
  // mostrabas, esto es lo que hace que la cámara aparezca sin recargar la
  // página a mano. Los fallos son silenciosos a propósito: es un refresh
  // de fondo, no la carga inicial -- una falla transitoria no debe tirar
  // abajo una vista que ya se había cargado bien.
  function handleQrClosed() {
    setShowQr(false);
    const t = guest?.token ?? token ?? '';
    if (!t) return;

    getGuestByToken(t)
      .then((found) => {
        if (!found) return;
        setGuest(found);
        setFader(STATUS_TO_FADER[found.status]);
        setPlusOne(found.plusOnesConfirmed);
        setNote(found.guestNote ?? '');
      })
      .catch(() => {
        /* refresh de fondo, no la carga inicial -- se ignora */
      });

    getPhotoQuota(t)
      .then(setPhotoQuota)
      .catch(() => {
        /* mismo criterio que el fetch inicial de cupo */
      });
  }

  async function handleSubmit() {
    if (!guest || fader === 'neutral' || submitting) return;
    const next: RsvpStatus = fader === 'yes' ? 'confirmed' : 'declined';
    setSubmitting(true);
    try {
      const updated = await submitRsvp(guest.token ?? token ?? '', next, plusOne, note);
      setGuest(updated);
      setEditing(false);
      setToastKind('success');
      setToast(next === 'confirmed' ? 'Quedaste dentro. Nos vemos ahí.' : 'Que penal, te vamos a extrañar. Gracias por avisar.');
    } catch (err) {
      setToastKind('error');
      setToast(err instanceof Error ? err.message : 'No pudimos guardar tu respuesta. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 px-4 pb-16 pt-8">
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-hotpink-500/20 blur-[90px]"
        aria-hidden
      />
      <div className="film-grain pointer-events-none absolute inset-0 opacity-[0.03]" aria-hidden />

      <div className="relative mx-auto flex max-w-md flex-col gap-4">
        <AnimatePresence mode="wait">
          {loading || !guest ? (
            <LoadingLights key="loading" reduceMotion={reduceMotion} />
          ) : guest.status === 'confirmed' && !editing ? (
            <ConfirmedScreen
              key="confirmed"
              guestName={guest.fullName}
              plusOne={guest.plusOnesConfirmed}
              token={guest.token ?? token ?? ''}
              checkedIn={Boolean(guest.checkedInAt)}
              onEdit={() => setEditing(true)}
              onShowQr={() => setShowQr(true)}
            />
          ) : guest.status === 'declined' && !editing ? (
            <DeclinedScreen key="declined" guestName={guest.fullName} onEdit={() => setEditing(true)} />
          ) : (
            <motion.div
              key="rsvp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              {event.rsvpDeadline && <RsvpDeadlineStrip deadline={event.rsvpDeadline} />}
              <WristbandCard guest={{ ...guest, plusOnesConfirmed: plusOne }} event={event} />

              <section className="flex flex-col gap-2 bg-ink-900 p-4 shadow-xl">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500">
                  Crossfader master // RSVP
                </span>
                <FaderToggle value={fader} onChange={setFader} />
              </section>

              {guest.plusOnesAllowed > 0 && (
                <section className="flex flex-col gap-2 bg-ink-900 p-4 shadow-xl">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-hotpink-500">
                    Acompañantes (+1)
                  </span>
                  <div className="flex items-center justify-between gap-4 bg-ink-950 p-3">
                    <button
                      type="button"
                      onClick={() => setPlusOne((v) => Math.max(0, v - 1))}
                      className="tap-target flex items-center justify-center bg-smoke-700/30 font-display text-xl text-paper-100 active:scale-95"
                    >
                      −
                    </button>
                    <div className="flex flex-col items-center">
                      <span className="font-display text-3xl text-hotpink-500">+{plusOne}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-paper-100/70">
                        / máx {guest.plusOnesAllowed}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlusOne((v) => Math.min(guest.plusOnesAllowed, v + 1))}
                      className="tap-target flex items-center justify-center bg-hotpink-500/20 font-display text-xl text-hotpink-500 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </section>
              )}

              <section className="flex flex-col gap-2 bg-ink-900 p-4 shadow-xl">
                <label
                  htmlFor="guest-note"
                  className="font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100/70"
                >
                  Mensaje a puerta // nota privada
                </label>
                <textarea
                  id="guest-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="Avisale algo a la puerta o a la cabina..."
                  className="resize-none bg-ink-950 p-3 font-sans text-sm text-paper-100 outline-none placeholder-smoke-700"
                />
                <span className="self-end font-mono text-[10px] text-paper-100/70">{note.length} / 200</span>
              </section>

              <button
                type="button"
                disabled={fader === 'neutral' || submitting}
                onClick={handleSubmit}
                className={`h-14 font-display text-lg uppercase tracking-wider transition-all active:scale-[0.98] ${
                  fader === 'neutral' || submitting
                    ? 'cursor-not-allowed bg-smoke-700/40 text-paper-100/70'
                    : fader === 'yes'
                      ? 'bg-acid-400 text-ink-950 shadow-glow-acid'
                      : 'bg-flame-500 text-ink-950 shadow-glow-flame'
                }`}
              >
                {submitting
                  ? 'Enviando...'
                  : fader === 'neutral'
                    ? 'Definí tu postura en el fader'
                    : fader === 'yes'
                      ? 'Confirmar asistencia // en puerta'
                      : 'Liberar cupo // no asistiré'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && guest && guest.checkedInAt && photoQuota && (
          <CameraCapture token={guest.token ?? token ?? ''} quota={photoQuota} onQuotaChange={setPhotoQuota} />
        )}

        {/* ConfirmedScreen carries its own link to the hub as part of its CTA
            block; showing the generic chip too would just duplicate it. */}
        {!loading && guest && !(guest.status === 'confirmed' && !editing) && <EventHubChip />}

        {/* Solo para DEV_GUEST_TOKEN, y ADEMÁS de la experiencia real de
            invitado, no en su lugar -- ver docs/BACKLOG.md Etapa 5, Parte B. */}
        {!loading && guest && guest.token === DEV_GUEST_TOKEN && (
          <Suspense fallback={null}>
            <DevPanel guest={guest} token={guest.token} onGuestChange={handleDevGuestChange} />
          </Suspense>
        )}
      </div>

      {showQr && (
        <Suspense fallback={null}>
          <DoorQrOverlay token={guest?.token ?? token ?? ''} onClose={handleQrClosed} />
        </Suspense>
      )}

      <SignalToast message={toast} kind={toastKind} onDismiss={() => setToast(null)} />
    </div>
  );
}

// El link visible hacia el hub compartido (docs/BACKLOG.md, Decisión 4.3):
// avisos, cuenta atrás y rollo revelado ya no viven embebidos acá, este
// chip es cómo se llega a esa vista común.
function EventHubChip() {
  return (
    <Link
      to="/evento"
      className="tap-target flex items-center justify-center gap-2 bg-ink-900 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500 shadow-xl transition-colors hover:bg-laser-500/10"
    >
      Ver la cartelera del evento
    </Link>
  );
}

function LoadingLights({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      key="loading"
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center"
    >
      <span className="font-mono text-[11px] uppercase tracking-widest text-laser-500">Encendiendo la puerta...</span>
      <motion.h1
        className="font-display text-3xl uppercase tracking-wide text-paper-100"
        animate={reduceMotion ? { opacity: 1 } : { opacity: [0.2, 1, 0.3, 1, 1] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.9, times: [0, 0.3, 0.5, 0.7, 1] }}
      >
        Verificando invitación...
      </motion.h1>
    </motion.div>
  );
}

function ConfirmedScreen({
  guestName,
  plusOne,
  token,
  checkedIn,
  onEdit,
  onShowQr,
}: {
  guestName: string;
  plusOne: number;
  token: string;
  checkedIn: boolean;
  onEdit: () => void;
  onShowQr: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4 py-6 text-center"
    >
      <span className="bg-ink-950 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-acid-400 shadow-glow-acid">
        [ Access granted ]
      </span>
      <h1 className="font-display text-5xl uppercase leading-none tracking-wide text-paper-100">
        ¡Estás <span className="text-acid-400">adentro</span>!
      </h1>
      <p className="font-sans text-sm uppercase tracking-wide text-hotpink-500">
        Ya quedaste en la lista. Nos vemos ahí.
      </p>

      <div className="mt-4 w-full bg-ink-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-col text-left">
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/70">Pass identifier</span>
            <span className="font-mono text-sm text-acid-400">{token.toUpperCase()}</span>
          </div>
          <span className="bg-ink-950 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-hotpink-500">
            Acceso confirmado
          </span>
        </div>
        <h2 className="mt-3 text-left font-display text-2xl uppercase leading-none text-paper-100">{guestName}</h2>
        {plusOne > 0 && (
          <p className="mt-2 inline-flex bg-acid-400/10 px-2 py-1 text-left font-mono text-xs font-bold uppercase text-acid-400">
            +{plusOne} invitados ({plusOne + 1} cupos asegurados)
          </p>
        )}
      </div>

      <div className="w-full bg-ink-900 p-4 text-left shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper-100/70">Cámara // acceso</span>
          <span
            className={`bg-ink-950 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              checkedIn ? 'text-acid-400' : 'text-laser-500'
            }`}
          >
            {checkedIn ? 'Desbloqueada' : 'Bloqueada'}
          </span>
        </div>
        <p className="mt-2 font-sans text-sm text-paper-100/80">
          {checkedIn
            ? 'Ya te reconocieron en la puerta. La cámara está lista para usar.'
            : 'La cámara se desbloquea cuando te escaneen en la puerta. Hasta entonces tu pase es solo la entrada.'}
        </p>
        {!checkedIn && (
          <button
            type="button"
            onClick={onShowQr}
            className="tap-target mt-3 flex w-full items-center justify-center bg-laser-500/10 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
          >
            Mostrar mi QR en la puerta
          </button>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        <Link
          to="/evento"
          className="tap-target flex items-center justify-center bg-laser-500/10 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
        >
          Ver la cartelera del evento
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="tap-target font-mono text-[11px] uppercase tracking-wider text-paper-100/70 underline underline-offset-4"
        >
          Editar mi respuesta
        </button>
      </div>
    </motion.section>
  );
}

function DeclinedScreen({ guestName, onEdit }: { guestName: string; onEdit: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center"
    >
      <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Cupo liberado</span>
      <h1 className="font-display text-3xl uppercase leading-tight text-paper-100">
        Que penal, {guestName.split(' ')[0]}.
      </h1>
      <p className="max-w-xs font-sans text-sm text-paper-100/70">Te vamos a extrañar. Gracias por avisar.</p>

      <button
        type="button"
        onClick={onEdit}
        className="tap-target font-mono text-[11px] uppercase tracking-wider text-paper-100/70 underline underline-offset-4"
      >
        Editar mi respuesta
      </button>
    </motion.section>
  );
}

function InvalidTokenScreen({ token }: { token?: string }) {
  return (
    <div className="relative min-h-screen bg-ink-950 px-4 pb-16 pt-8">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-center justify-between bg-ink-900 px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Error // hard-refusal</span>
          <span className="font-mono text-[10px] text-paper-100/70">SCANNER_SYS.09</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1 bg-flame-500/20 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-flame-500">
            Access denied
          </span>
          <h1 className="font-display text-4xl uppercase leading-none text-paper-100">No estás en lista</h1>
          <p className="font-sans text-sm text-paper-100/70">
            Esta entrada no es válida. Revisá el link que te mandaron por WhatsApp.
          </p>
        </div>

        <div className="flex flex-col gap-2 bg-ink-900 p-4 shadow-2xl">
          <span className="font-mono text-[11px] uppercase tracking-widest text-flame-500">Pase corrupto</span>
          <p className="font-mono text-[11px] uppercase tracking-widest text-paper-100/70">
            Hash: 0x000000000000 // unresolved{token ? ` // token "${token}"` : ''}
          </p>
        </div>

        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target flex items-center justify-center bg-smoke-700/30 px-4 py-3 font-sans text-sm font-bold text-paper-100"
        >
          Pedir link al host
        </a>
      </div>
    </div>
  );
}
