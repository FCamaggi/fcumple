import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { acceptOwnerInvite } from '../lib/organizerApi';

const INVALID_LINK_MESSAGE = 'El link no es válido, ya se usó o venció. Pídele uno nuevo a quien te invitó.';
const OWNER_LIMIT_MESSAGE = 'Este evento ya llegó al máximo de dueños (10).';

function formatJoinError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'P0002') return INVALID_LINK_MESSAGE;
    if (code === '53400') return OWNER_LIMIT_MESSAGE;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'No pudimos aceptar la invitación. Intenta de nuevo.';
}

/**
 * `/panel/unirse/:token` — acepta un link de invitación de un solo uso para ser
 * co-dueño de un evento y redirige al panel de ese evento.
 */
export default function JoinEventPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const attemptedTokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError(INVALID_LINK_MESSAGE);
      return;
    }
    if (attemptedTokenRef.current === token) return;
    attemptedTokenRef.current = token;

    acceptOwnerInvite(token)
      .then((eventId) => {
        navigate(`/panel/e/${eventId}`, { replace: true });
      })
      .catch((err: unknown) => {
        setError(formatJoinError(err));
      });
  }, [token, navigate]);

  if (error) {
    return (
      <div className="flex min-h-app items-center justify-center bg-ink-950 px-4 text-paper-100">
        <div className="flex w-full max-w-sm flex-col gap-4 border border-smoke-700/40 bg-ink-900 p-6 shadow-2xl">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-widest text-laser-500">Organizadores</span>
            <h1 className="font-display text-2xl uppercase tracking-wide text-paper-100">Invitación al evento</h1>
          </div>
          <p role="alert" className="font-sans text-sm text-flame-500">
            {error}
          </p>
          <Link
            to="/panel"
            className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-wider text-acid-400 underline"
          >
            ← Tus eventos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-app items-center justify-center bg-ink-950 px-4 text-paper-100">
      <p role="status" className="font-mono text-xs uppercase tracking-widest text-paper-100/70">
        Aceptando invitación...
      </p>
    </div>
  );
}
