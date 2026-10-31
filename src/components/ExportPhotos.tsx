import { useState } from 'react';
import { buildPhotosZip, planExport, safeFileName, saveBlob, type ExportProgress } from '../lib/photoExport';
import type { ModerationPhoto } from '../lib/photosApi';

interface ExportPhotosProps {
  photos: readonly ModerationPhoto[];
  eventSlug: string;
}

/**
 * Descarga las fotos ORIGINALES del evento en un .zip (una carpeta por invitado). Corre en el navegador con la
 * sesión de la organizadora: la política de Storage ya le da lectura sobre las fotos de sus eventos, así que no
 * hace falta ninguna clave especial ni un backend.
 */
export default function ExportPhotos({ photos, eventSlug }: ExportPhotosProps) {
  const [includeAll, setIncludeAll] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const plan = planExport(photos, includeAll);

  async function handleExport() {
    if (busy || plan.length === 0) return;
    setBusy(true);
    setMessage(null);
    setProgress({ done: 0, total: plan.length, failed: 0 });
    try {
      const result = await buildPhotosZip(plan, setProgress);
      if (result.failed === result.total) {
        setMessage({ kind: 'error', text: 'No pudimos descargar ninguna foto. Revisa tu conexión e intenta de nuevo.' });
        return;
      }
      saveBlob(result.blob, `fotos-${safeFileName(eventSlug, 'evento')}.zip`);
      setMessage(
        result.failed > 0
          ? { kind: 'error', text: `Descargamos ${result.total - result.failed} de ${result.total}. ${result.failed} fallaron: vuelve a exportar.` }
          : { kind: 'ok', text: `Listo: ${result.total} foto(s) en el .zip.` },
      );
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos armar el .zip. Intenta de nuevo.' });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section className="flex flex-col gap-2 border border-smoke-700/50 p-3" aria-label="Exportar fotos">
      <h3 className="font-display text-sm uppercase tracking-wider">Exportar fotos</h3>
      <p className="font-sans text-sm text-paper-100/80">
        Descarga las fotos en su calidad original, en un .zip con una carpeta por invitado. Déjalo abierto hasta que
        termine.
      </p>
      <label className="flex min-h-11 items-center gap-2 font-sans text-sm">
        <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} disabled={busy} />
        Incluir también las pendientes y rechazadas
      </label>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy || plan.length === 0}
        className="h-11 self-start border border-acid-400 px-5 font-display text-sm uppercase tracking-wider text-acid-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && progress ? `Descargando ${progress.done} de ${progress.total}...` : `Exportar ${plan.length} foto(s)`}
      </button>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`font-mono text-xs uppercase tracking-wide ${message.kind === 'error' ? 'text-flame-500' : 'text-acid-400'}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
