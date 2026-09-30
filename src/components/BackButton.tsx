import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Botón "Volver" que dispara el volver del navegador. Las páginas públicas
 * (`/evento`, `/como-llegar`) no saben de qué invitación (`/i/:token`) vino
 * cada visita, así que retroceder en el historial es la única forma de
 * devolverlas al lugar correcto.
 *
 * Si la página se abrió directo (sin historial dentro de la app), volver no
 * llevaría a ningún lado: se va a `fallbackTo`, o el botón no se muestra si
 * no hay fallback.
 */
export default function BackButton({ fallbackTo }: { fallbackTo?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = location.key !== 'default';

  if (!hasHistory && !fallbackTo) return null;

  function handleClick() {
    if (hasHistory) navigate(-1);
    else if (fallbackTo) navigate(fallbackTo, { replace: true });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="tap-target flex items-center gap-2 self-start font-mono text-[11px] font-bold uppercase tracking-wider text-laser-500"
    >
      <span aria-hidden>←</span> Volver
    </button>
  );
}
