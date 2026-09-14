-- Bug real de QA (docs/08-QA/140920260509.md, sección "Sistema"): editar a
-- un invitado de 'confirmed' a 'pending' (o 'declined') -- sea porque el
-- admin lo corrige a mano en update_guest, o porque el propio invitado
-- edita su respuesta desde submit_rsvp -- nunca limpiaba checked_in_at.
-- Como GuestPage.tsx muestra la cámara según checked_in_at (ver
-- src/pages/GuestPage.tsx), el invitado terminaba viendo el formulario de
-- RSVP (o la pantalla de rechazado) Y la cámara al mismo tiempo: dos
-- estados que el propio host marcó como "completamente incompatibles".
--
-- Un trigger a nivel de tabla (en vez de repetir "if status cambia, limpiá
-- checked_in_at" en cada RPC) cubre todos los caminos de escritura por
-- igual, incluyendo el que va a existir mañana y todavía no escribimos.
create or replace function public.reset_checked_in_at_on_status_change()
returns trigger
language plpgsql
as $$
begin
  -- Ojo: check_in_guest() puede marcar checked_in_at en un invitado
  -- 'pending' (Etapa 3, "no limitante" -- el check-in en puerta nunca
  -- depende del RSVP), así que esto NO es "checked_in_at solo puede existir
  -- si status = confirmed". Es más angosto: solo se limpia cuando la fila
  -- efectivamente DEJA de estar confirmed (old.status = 'confirmed' y
  -- new.status ya no lo es), que es exactamente el caso del bug real
  -- (confirmado -> pending/declined sin limpiar el check-in). Si ya era
  -- null, o si status sigue siendo 'confirmed', o si nunca fue 'confirmed',
  -- esto es un no-op.
  if old.status = 'confirmed' and new.status is distinct from 'confirmed' and new.checked_in_at is not null then
    new.checked_in_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists guests_reset_checked_in_at on public.guests;
create trigger guests_reset_checked_in_at
  before update on public.guests
  for each row
  execute function public.reset_checked_in_at_on_status_change();
