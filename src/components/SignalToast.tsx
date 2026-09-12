import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export type SignalKind = 'success' | 'error' | 'info';

interface SignalToastProps {
  message: string | null;
  kind?: SignalKind;
  onDismiss?: () => void;
}

const KIND_STYLES: Record<SignalKind, string> = {
  success: 'border-acid-400 text-acid-400 shadow-glow-acid',
  error: 'border-flame-500 text-flame-500 shadow-glow-flame',
  info: 'border-laser-500 text-laser-500 shadow-glow-laser',
};

/**
 * SignalToast — confirmaciones y errores del sistema.
 * Señal de neón que se prende abajo del centro, en vez del toast genérico
 * de esquina superior con ícono de check.
 */
export default function SignalToast({ message, kind = 'info', onDismiss }: SignalToastProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            role="status"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: [0, 1, 0.4, 1], y: 0, scale: 1 }
            }
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5 }}
            onClick={onDismiss}
            className={`pointer-events-auto max-w-sm rounded border bg-ink-950 px-4 py-3 font-mono text-xs uppercase tracking-wide ${KIND_STYLES[kind]}`}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
