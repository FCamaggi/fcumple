# Arquitectura multi-tenant (Fase 1)

Punto de partida real (Fase 0): `event_config` es una fila única (PK booleana fija); `guests`, `photos`, `posts` no tienen `event_id`; el admin es un único usuario con políticas `authenticated using (true)`; los invitados acceden solo vía RPC `SECURITY DEFINER` que validan el token.

## Decisión de modelo: sin `tenants` separado en el MVP

El informe proponía `tenant_id` + `event_id`. Con un solo desarrollador y pocos clientes, **el tenant es el organizador** (`auth.users`). Una tabla `organizations` se difiere hasta que haya equipos con varios miembros (Fase 2). Esto simplifica las políticas: un evento pertenece a un `owner_id`.

## Tablas

```
events
  id uuid pk
  owner_id uuid not null references auth.users   -- organizador
  slug text unique not null                       -- /e/:slug
  name text, starts_at timestamptz, location text, rsvp_deadline timestamptz
  settings jsonb not null default '{}'            -- cuotas, reveal, etc.
  created_at, updated_at

guests      + event_id uuid not null references events on delete cascade
photos      + event_id uuid not null references events on delete cascade
posts       + event_id uuid not null references events on delete cascade
post_images + (hereda event_id vía posts)

event_frames    (ver marcos-y-stickers.md)
event_stickers  (ver marcos-y-stickers.md)
```

Índices: `(event_id)` en cada tabla hija y `unique (event_id, token)` donde corresponda. `guests.token` sigue siendo único globalmente y resuelve el evento. `guests` gana `rut text` (normalizado, `unique (event_id, rut)` cuando no es nulo), `claimed_at`, `last_seen_at` y `approval_status` ('approved' | 'pending' | 'rejected'). `events.settings.access` define el modo de acceso.

## Seguridad (RLS)

**Organizador** (autenticado): política por tabla con `event_id in (select id from events where owner_id = auth.uid())`. Se reemplazan todas las `authenticated_full_access using (true)`.

**Invitado** (anónimo, sin JWT): se mantiene el modelo de la Fase 0. Ninguna política para `anon`; todo acceso por RPC `SECURITY DEFINER` que resuelve `guest → event_id` desde el token y filtra por ese `event_id`. La diferencia es de dónde sale el token: ya no lo envía el organizador por invitado, lo entrega la RPC nueva `identify_guest(p_slug, p_rut)` (ver [`acceso-de-invitados.md`](./acceso-de-invitados.md)). Las RPC existentes (`get_guest_by_token`, `submit_rsvp`, `submit_photo`, `get_photo_quota`, `check_in_guest`, `list_revealed_photos`, `get_public_headcount`, …) cambian así:

- Las que reciben token: derivan `event_id` del invitado; ya no asumen "el único evento".
- Las que hoy son globales (`get_public_headcount`, info del evento, avisos): reciben `p_slug` y filtran por evento.
- Nuevas: `identify_guest`, `request_access` (modo con solicitudes), `list_event_camera_assets(p_token)`.

**Storage:** el bucket privado `party-photos` se mantiene, con rutas `"{event_id}/{guest_id}/{uuid}.jpg"`. Las políticas de storage (`token_matches_guest` y similares) validan que el prefijo `event_id` coincida con el del invitado. Un bucket nuevo (o prefijo) `event-assets` para marcos/stickers del organizador (ver spec).

**Por qué no JWT con claims:** el informe proponía sesión anónima con claims. Exigiría reescribir el flujo completo de invitados y no aporta aislamiento adicional mientras las RPC filtren por evento. Se difiere (junto con sesiones por dispositivo) a la Fase 2.

## Rutas del frontend

| Ruta Fase 0 | Fase 1 |
|---|---|
| `/i/:token` | **Desaparece.** Ver [`acceso-de-invitados.md`](./acceso-de-invitados.md). |
| `/evento` | `/e/:slug` — entrada del invitado: si no hay token guardado muestra "¿Quién eres?"; si lo hay, el hub (avisos, cámara, carrete). |
| `/como-llegar` | `/e/:slug/como-llegar` (datos del evento en BD, no en `routes.ts`) |
| `/admin` | `/admin` (lista de eventos del organizador) y `/admin/e/:eventId/{invitados,fotos,avisos,camara,ajustes}` |
| `/` redirige a `/i/invalido` | landing mínima o login de organizador |

`routes.ts` (rutas de "cómo llegar" codificadas) pasa a datos por evento (`events.settings` o tabla propia).

## Reinicio del esquema (sin migración del evento anterior)

El evento de la Fase 0 ya ocurrió y no se conserva. Por eso **no hay migración de datos ni compatibilidad con los tokens/enlaces viejos**:

1. Respaldo previo: `pg_dump` del proyecto y descarga de lo que se quiera guardar del bucket `party-photos` (archivo personal).
2. Nuevas migraciones que eliminan los objetos de la Fase 0 (`event_config`, `guests`, `photos`, `posts`, `post_images` y sus RPC) y crean el esquema multi-tenant desde cero. El historial de migraciones viejo se deja intacto.
3. Vaciar el bucket `party-photos` y crear los buckets nuevos con prefijo `event_id`.
4. Adaptar los tests de `supabase/tests` al esquema nuevo.

> Confirmar con el usuario antes de ejecutar el borrado en producción (acción irreversible sin el respaldo).

## Tests

- Adaptar `supabase/tests/*` para crear un evento y colgar de él los datos.
- Test nuevo: dos organizadores y dos eventos; verificar que ninguna política/RPC cruza datos ni storage.
- Ver `supabase/README.md` para el arnés de Postgres en Docker.

## Mantener vivo el free tier

Supabase free pausa el proyecto tras 7 días sin actividad. Un workflow programado de GitHub Actions hace un `select 1` vía REST cada ~3 días.
