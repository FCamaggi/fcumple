-- Formularios de opciones para clientes (p. ej. la persona que cumple anos
-- elige estilo, paleta y marcos antes de armar su evento). La modalidad se va
-- a repetir, asi que una sola tabla guarda las respuestas de todos los
-- formularios, distinguidos por slug.
--
-- Nadie lee esta tabla desde la app: no tiene politicas ni privilegios para
-- anon ni authenticated (un organizador no debe ver lo que responde el
-- cliente de otro). Las respuestas se leen desde el Table Editor de Supabase.
-- La unica via de escritura es submit_client_brief, que valida y limita.
create table public.client_briefs (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  -- Nombre de quien responde (opcional), solo para identificar la respuesta.
  respondent text check (respondent is null or char_length(respondent) <= 80),
  -- { <id de pregunta>: { pregunta, elegidas: [...], nota } }
  answers jsonb not null
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 20000),
  created_at timestamptz not null default now()
);

create index client_briefs_slug_created_idx
  on public.client_briefs (slug, created_at desc);

alter table public.client_briefs enable row level security;
revoke all on public.client_briefs from public, anon, authenticated;

-- Guarda una respuesta. Tope por formulario y total para que un enlace
-- publico no sirva para llenar la tabla.
create or replace function public.submit_client_brief(
  p_slug text,
  p_respondent text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_respondent text := nullif(btrim(coalesce(p_respondent, '')), '');
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 60 then
    raise exception 'invalid brief slug' using errcode = '22023';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 20000 then
    raise exception 'invalid brief answers' using errcode = '22023';
  end if;

  if v_respondent is not null and char_length(v_respondent) > 80 then
    raise exception 'respondent too long' using errcode = '22023';
  end if;

  if (select count(*) from public.client_briefs b where b.slug = p_slug) >= 200
     or (select count(*) from public.client_briefs) >= 2000 then
    raise exception 'too many briefs' using errcode = '54000';
  end if;

  insert into public.client_briefs (slug, respondent, answers)
  values (p_slug, v_respondent, p_answers)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_client_brief(text, text, jsonb) from public;
grant execute on function public.submit_client_brief(text, text, jsonb) to anon, authenticated;
