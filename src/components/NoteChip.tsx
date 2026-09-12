import { useState } from 'react';

interface NoteChipProps {
  text: string;
  /** Confidential notes (admin-only) get an amber "backstage" treatment. */
  confidential?: boolean;
}

/**
 * NoteChip — nota privada del admin.
 * Chip discreto que se expande al tocar para mostrar el texto completo,
 * como una ficha de backstage.
 */
export default function NoteChip({ text, confidential = false }: NoteChipProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return <span className="font-mono text-[11px] text-paper-100/70">—</span>;

  const color = confidential ? 'text-flame-500 border-flame-500/40' : 'text-laser-500 border-smoke-700/40';

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={`tap-target inline-flex max-w-full items-start gap-1.5 rounded border bg-ink-950 px-2 py-1 text-left font-mono text-[11px] transition-colors ${color}`}
      aria-expanded={expanded}
    >
      <span aria-hidden>{confidential ? '◆' : '◇'}</span>
      <span className={expanded ? '' : 'line-clamp-1'}>{text}</span>
    </button>
  );
}
