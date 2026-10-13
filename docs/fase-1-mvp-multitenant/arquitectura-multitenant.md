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

Índices: `(event_id)` en cada tabla hija y `unique (event_id, token)` donde corresponda. `guests.token` sigue siendo único globalmente (el enlace del invitado no incluye el slug en el modelo actual `/i/:token`, así que el token resuelve el evento).

## Seguridad (RLS)

**Organizador** (autenticado): política por tabla con `event_id in (select id from events where owner_id = auth.uid())`. Se reemplazan todas las `authenticated_full_access using (true)`.

**Invitado** (anónimo, sin JWT): se mantiene el modelo de Fase 0. Ninguna política para `anon`; todo acceso por RPC `SECURITY DEFINER` que resuelve `guest → event_id` desde el token y filtra por ese `event_id`. Las RPC existentes (`get_guest_by_token`, `submit_rsvp`, `submit_photo`, `get_photo_quota`, `check_in_guest`, `list_revealed_photos`, `get_public_headcount`, …) cambian así:

- Las que reciben token: derivan `event_id` del invitado; ya no asumen "el único evento".
- Las que hoy son globales (`get_public_headcount`, info del evento, avisos del hub `/evento`): reciben `p_slug` y filtran por evento.

**Storage:** el bucket privado `party-photos` se mantiene, con rutas `"{event_id}/{guest_id}/{uuid}.jpg"`. Las políticas de storage (`token_matches_guest` y similares) validan que el prefijo `event_id` coincida con el del invitado. Un bucket nuevo (o prefijo) `event-assets` para marcos/stickers del organizador (ver spec).

**Por qué no JWT con claims:** el informe proponía sesión anónima con claims. Exigiría reescribir el flujo completo de invitados y no aporta aislamiento adicional mientras las RPC filtren por evento. Se difiere.

## Rutas del frontend

| Ruta Fase 0 | Fase 1 |
|---|---|
| `/i/:token` | `/i/:token` (sin cambio; el token resuelve el evento) |
| `/evento` | `/e/:slug` (hub público) |
| `/como-llegar` | `/e/:slug/como-llegar` (datos del evento en BD, no en `routes.ts`) |
| `/admin` | `/admin` (lista de eventos del organizador) y `/admin/e/:eventId/...` (consola del evento) |
| `/` redirige a `/i/invalido` | landing mínima o login de organizador |

`routes.ts` (rutas de "cómo llegar" codificadas) pasa a datos por evento (`events.settings` o tabla propia). Puede dejarse hardcodeado para el evento 1 si se acota el MVP.

## Migración del evento actual

Una migración de datos, en una sola transacción:

1. Crear `events` y el evento #1 a partir de `event_config` (slug p. ej. `cumple-fabrizio`, `owner_id` = el admin actual).
2. Agregar `event_id` como nullable, rellenar con el id del evento #1, luego `set not null`.
3. Mover los objetos existentes de Storage al nuevo prefijo (o mantener ambos formatos con una política que acepte el viejo hasta migrar).
4. Reescribir políticas y RPC.
5. Verificar con los tests existentes adaptados + un test de aislamiento nuevo.

Los enlaces `/i/:token` ya entregados deben seguir funcionando. **No se tocan los tokens.**

## Tests

- Adaptar `supabase/tests/*` para crear un evento y colgar de él los datos.
- Test nuevo: dos organizadores y dos eventos; verificar que ninguna política/RPC cruza datos ni storage.
- Ver `supabase/README.md` para el arnés de Postgres en Docker.

## Mantener vivo el free tier

Supabase free pausa el proyecto tras 7 días sin actividad. Un workflow programado de GitHub Actions hace un `select 1` vía REST cada ~3 días.
