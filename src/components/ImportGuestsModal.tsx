import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { csvTemplate, parseGuestsCsv, type ParsedGuestRow, type ParseGuestsCsvError } from '../lib/csv';
import { createGuest } from '../lib/adminApi';
import type { Guest } from '../types';

interface ImportGuestsModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (created: Guest[]) => void;
}

interface Preview {
  valid: ParsedGuestRow[];
  errors: ParseGuestsCsvError[];
}

interface ImportSummary {
  created: number;
  failed: number;
}

function downloadTemplate() {
  const csv = csvTemplate();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-invitados.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import de invitados vía CSV pegado a mano: previsualiza filas
 * válidas/con error antes de confirmar, y al confirmar crea cada fila
 * válida contra adminApi.createGuest sin que un fallo bloquee al resto.
 */
export default function ImportGuestsModal({ open, onClose, onImported }: ImportGuestsModalProps) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handlePreview() {
    const result = parseGuestsCsv(text);
    setPreview(result);
    setSummary(null);
  }

  function handleClose() {
    setText('');
    setPreview(null);
    setSummary(null);
    onClose();
  }

  async function handleConfirm() {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    const results = await Promise.allSettled(
      preview.valid.map((row) =>
        createGuest(
          row.phone
            ? { fullName: row.fullName, plusOnesAllowed: row.plusOnesAllowed, phone: row.phone }
            : { fullName: row.fullName, plusOnesAllowed: row.plusOnesAllowed },
        ),
      )
    );
    const created: Guest[] = [];
    let failed = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') created.push(r.value);
      else failed++;
    }
    setImporting(false);
    setSummary({ created: created.length, failed });
    if (created.length > 0) onImported(created);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col gap-4 border border-smoke-700/50 bg-ink-900 p-6 shadow-2xl"
          >
            <span className="font-mono text-[11px] uppercase tracking-widest text-acid-400">Importar CSV</span>

            <div className="flex flex-col gap-1">
              <label htmlFor="import-csv-text" className="font-mono text-[11px] uppercase tracking-wider text-paper-100/70">
                Pegar CSV
              </label>
              <textarea
                id="import-csv-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                className="bg-ink-950 px-3 py-2 font-mono text-xs text-paper-100 outline-none"
                placeholder="full_name,plus_ones_allowed,phone (opcional)"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex-1 bg-smoke-700/30 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-paper-100 hover:bg-smoke-700/50"
              >
                Descargar plantilla
              </button>
              <button
                type="button"
                onClick={handlePreview}
                className="flex-1 bg-laser-500/80 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950"
              >
                Previsualizar
              </button>
            </div>

            {preview && (
              <div className="flex flex-col gap-2 bg-ink-950 p-3 font-mono text-[11px] text-paper-100/80">
                <span>
                  {preview.valid.length} fila{preview.valid.length === 1 ? '' : 's'} válida
                  {preview.valid.length === 1 ? '' : 's'} · {preview.errors.length} error
                  {preview.errors.length === 1 ? '' : 'es'}
                </span>
                {preview.errors.length > 0 && (
                  <ul className="flex flex-col gap-1 text-flame-500">
                    {preview.errors.map((e, idx) => (
                      <li key={idx}>
                        Fila {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {summary && (
              <div className="bg-ink-950 p-3 font-mono text-[11px] text-paper-100/80">
                {summary.created} creado{summary.created === 1 ? '' : 's'}
                {summary.failed > 0 && (
                  <span className="text-flame-500">
                    {' '}
                    · {summary.failed} fallido{summary.failed === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 bg-smoke-700/30 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-paper-100 hover:bg-smoke-700/50"
              >
                Cerrar
              </button>
              {preview && preview.valid.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={importing}
                  className="flex-1 bg-acid-400 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-acid active:scale-95 disabled:opacity-50"
                >
                  {importing ? 'Importando…' : `Confirmar (${preview.valid.length})`}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
