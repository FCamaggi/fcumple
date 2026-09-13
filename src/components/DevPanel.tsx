import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { submitRsvp } from '../lib/guestApi';
import { devCheckIn, devResetGuest } from '../lib/devApi';
import type { Guest } from '../types';

interface DevPanelProps {
  guest: Guest;
  token: string;
  onGuestChange: (guest: Guest) => void;
}

/**
 * DevPanel -- herramienta interna para recorrer todos los estados del
 * invitado de prueba (DEV_GUEST_TOKEN) de punta a punta. A propósito NO
 * sigue la estética "discoteca" del resto de la app (DESIGN.md la excluye
 * explícitamente): tiene que leerse de inmediato como "esto no es parte de
 * la invitación real", con la misma actitud franca que el resto del copy
 * pero sin disfrazarse de UI de invitado.
 */
export default function DevPanel({ guest, token, onGuestChange }: DevPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const link = `${window.location.origin}/i/${token}`;
    QRCode.toDataURL(link)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function run(action: string, fn: () => Promise<Guest>) {
    setBusy(action);
    setError(null);
    try {
      const updated = await fn();
      onGuestChange(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : `No pudimos ${action}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 border-4 border-dashed border-flame-500 bg-[repeating-linear-gradient(45deg,#3a3244_0px,#3a3244_10px,#0d0b12_10px,#0d0b12_20px)] p-4 text-paper-100 shadow-2xl">
      <div className="flex items-center justify-between bg-ink-950 px-3 py-2">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-flame-500">Panel DEV</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-smoke-700">token: {token}</span>
      </div>
      <p className="bg-ink-950 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-flame-500">
        No es parte de la experiencia de invitado -- solo existe para probar el flujo con el invitado de prueba.
      </p>

      <div className="flex flex-col gap-2 bg-ink-950 p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-smoke-700">Estado actual</span>
        <span className="font-mono text-xs text-paper-100">
          {guest.status} {guest.checkedInAt ? '// en la puerta' : '// sin check-in'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run('confirmar', () => submitRsvp(token, 'confirmed', guest.plusOnesAllowed, 'preview dev'))
          }
          className="bg-smoke-700/40 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 disabled:opacity-50"
        >
          Ver: confirmado
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('marcar como no voy', () => submitRsvp(token, 'declined', 0))}
          className="bg-smoke-700/40 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 disabled:opacity-50"
        >
          Ver: no voy
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('reiniciar el invitado de prueba', () => devResetGuest(token))}
          className="bg-smoke-700/40 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 disabled:opacity-50"
        >
          Reiniciar (vuelve a pendiente, borra fotos, quita check-in)
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('simular el check-in en la puerta', () => devCheckIn(token))}
          className="bg-smoke-700/40 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 disabled:opacity-50"
        >
          Simular check-in en la puerta
        </button>
      </div>

      {error && <p className="bg-ink-950 px-3 py-2 font-mono text-[11px] text-flame-500">{error}</p>}

      <Link
        to="/i/token-invalido-demo-xyz"
        className="bg-smoke-700/20 px-3 py-2 text-center font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 underline"
      >
        Ver: token inválido
      </Link>

      <div className="flex flex-col items-center gap-2 bg-ink-950 p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-smoke-700">
          QR real -- escanealo con el escáner del admin desde otro dispositivo
        </span>
        {qrDataUrl && <img src={qrDataUrl} alt="QR del link de este invitado de prueba" className="h-40 w-40" />}
      </div>
    </section>
  );
}
