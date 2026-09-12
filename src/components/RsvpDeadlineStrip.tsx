import { useEffect, useState } from 'react';

interface RsvpDeadlineStripProps {
  deadline: string; // ISO datetime
}

/**
 * RsvpDeadlineStrip — cuenta atrás para responder.
 * Franja fina tipo "última llamada de bar" con el tiempo restante en mono,
 * con leve pulso cuando quedan menos de 48 horas.
 */
export default function RsvpDeadlineStrip({ deadline }: RsvpDeadlineStripProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const deadlineMs = new Date(deadline).getTime();
  const remainingMs = deadlineMs - now;
  const expired = remainingMs <= 0;
  const hoursRemaining = Math.max(0, Math.floor(remainingMs / 3_600_000));
  const isUrgent = !expired && remainingMs < 48 * 3_600_000;

  return (
    <div
      className={`flex items-center justify-between rounded border px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
        expired
          ? 'border-flame-500/50 text-flame-500'
          : isUrgent
            ? 'animate-pulse border-flame-500/60 text-flame-500'
            : 'border-smoke-700/50 text-laser-500'
      }`}
    >
      <span>{expired ? 'RSVP cerrado' : 'Última llamada'}</span>
      <span className="font-bold">
        {expired ? formatDate(deadline) : `Quedan ${hoursRemaining}h para confirmar`}
      </span>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
