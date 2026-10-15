-- Fase 1 (multi-tenant) -- fundamentos compartidos.
-- Este directorio NO es el que aplica `supabase db push` en el deploy de la
-- Fase 0: ver ../README.md para el plan de corte a un proyecto nuevo.

create extension if not exists pgcrypto;

-- Token de sesion del invitado (72 bits, URL-safe). Ya no viaja en un enlace
-- por invitado: lo entrega identify_guest tras identificarse. NUNCA debe
-- formar parte de una ruta de Storage (la Fase 0 lo hacia y list_revealed_photos
-- lo filtraba a cualquiera; aqui las rutas usan ids no secretos).
create or replace function public.generate_guest_token()
returns text
language sql
volatile
as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Normaliza un nombre a un conjunto ordenado de palabras en minusculas, sin
-- tildes ni signos, sin particulas ("de", "la"...) ni iniciales sueltas. Es la
-- base de la identificacion por nombre: "Maria  de los Angeles Perez" y
-- "perez, maria angeles" producen las mismas palabras.
create or replace function public.name_tokens(p_name text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
  from regexp_split_to_table(
    lower(translate(
      coalesce(p_name, ''),
      'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç',
      'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'
    )),
    '[^a-z]+'
  ) as t
  where length(t) >= 2
    and t not in ('de', 'del', 'la', 'las', 'los', 'y');
$$;

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      lower(translate(
        coalesce(p_text, ''),
        'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç',
        'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'
      )),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

-- Sufijo aleatorio sin caracteres ambiguos (0/o, 1/l/i) para que el enlace
-- del evento no sea adivinable.
create or replace function public.random_suffix(p_len int default 4)
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes bytea := gen_random_bytes(p_len);
  result text := '';
  i int;
begin
  for i in 0 .. p_len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;
