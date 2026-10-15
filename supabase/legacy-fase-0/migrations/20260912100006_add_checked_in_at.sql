-- Etapa 3 (check-in QR): marca festiva de "llegó a la puerta", separada del
-- flujo de RSVP. Nullable, sin default -- null significa que todavía no
-- llegó; una vez seteada por check_in_guest() no se vuelve a tocar.
alter table public.guests add column if not exists checked_in_at timestamptz;
