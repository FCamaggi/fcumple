import { guestsToCsv } from '../lib/csv';
import type { Guest } from '../types';

interface ExportGuestsButtonProps {
  guests: Guest[];
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Descarga real disparada por click del propio usuario en su navegador
 * (Blob + <a download> sintético) — no un artifact de Claude.
 */
export default function ExportGuestsButton({ guests }: ExportGuestsButtonProps) {
  function handleClick() {
    const csv = guestsToCsv(guests);
    downloadCsv('invitados.csv', csv);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="border border-smoke-700/50 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-paper-100 transition-colors hover:bg-smoke-700/30"
    >
      Exportar CSV
    </button>
  );
}
