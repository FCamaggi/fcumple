# Arquitectura multi-tenant (Fase 1)

Punto de partida real (Fase 0): `event_config` es una fila única (PK booleana fija); `guests`, `photos`, `posts` no tienen `event_id`; el admin es un único usuario con políticas `authenticated using (true)`; los invitados acceden solo vía RPC `SECURITY DEFINER` que validan el token.

## Decisión de modelo: sin `tenants` separado en el MVP

El informe proponía `tenant_id` + `event_id`. Con un solo desarrollador y pocos clientes, **el tenant es el organizador** (`auth.users`). Una tabla `organizations` se difiere hasta que haya equipos con varios miembros (Fase 2). Esto simplifica las políticas: un evento pertenece a un `owner_id`.

## Tablas (implementadas en `supabase/fase-1/migrations/`)

```
events         id, owner_id → auth.users, slug (único), name, starts_at, location,
               rsvp_deadline, photos_revealed_at,
               access_mode ('open'|'list'|'list_requests'),  -- por defecto 'open'
               camera_unlock ('on_identify'|'on_checkin'),
               rsvp_enabled
guests         id, event_id, full_name, name_tokens text[] (la mantiene un trigger),
               token (secreto de sesión), status, plus_ones_*, photo_quota,
               auto_approve_photos, checked_in_at,
               approval_status ('approved'|'pending'|'rejected'),
               claimed_at, last_seen_at
               — mínimo 2 palabras en el nombre; único por (event_id, name_tokens)
guest_credentials  guest_id, pin_hash (bcrypt), failed_count, locked_until
               — sin ningún permiso para anon ni authenticated
photos         id, event_id, guest_id, storage_path, display_storage_path, status
               — FK compuesta (guest_id, event_id): no puede colgar de otro evento
posts          id, event_id, title, subtitle, body, cover_image_path, published_at
post_images    id, event_id, post_id, storage_path, position  (FK compuesta con posts)
identify_attempts  event_id, client_key, attempted_at  (fallos de inscripción / login; sin acceso externo)
```

No existe ninguna columna de RUT, correo, teléfono ni PIN en claro. Las opciones de cámara (`frames_enabled`, `stickers_enabled`, marco por defecto) y las tablas `event_frames` / `event_stickers` llegan en la Etapa 3 como **columnas** de `events` (no un `jsonb`), por el mismo motivo que arriba: tipado y RLS más simples.

## Seguridad (RLS)

**Organizador** (autenticado): política por tabla con `event_id in (select id from events where owner_id = auth.uid())`. Se reemplazan todas las `authenticated_full_access using (true)`.

**Invitado** (anónimo, sin JWT): se mantiene el modelo de la Fase 0. Ninguna política para `anon`; todo acceso por RPC `SECURITY DEFINER` que resuelve `guest → event_id` desde el token y filtra por ese `event_id`. La diferencia es de dónde sale el token: ya no lo envía el organizador por invitado, lo entregan `register_guest` y `login_guest` (inscripción y sesión con PIN; ver [`acceso-de-invitados.md`](./acceso-de-invitados.md)). Las RPC cambian así:

- Las que reciben token: derivan `event_id` del invitado; ya no asumen "el único evento".
- Las que hoy son globales (`get_public_headcount`, info del evento, avisos): reciben `p_slug` y filtran por evento.
- Nuevas: `register_guest`, `login_guest`, `get_event_public`, `list_published_posts`, `create_event`; `list_event_camera_assets(p_token)` llega en la Etapa 3.
- Endurecidas respecto a la Fase 0: `check_in_guest` solo para el dueño del evento; `list_revealed_photos(p_token)` exige un invitado identificado (antes era público y sin token).
- Las tablas no tienen ningún privilegio para `anon`; todo pasa por RPC. Las funciones internas (`_guard_attempts`, `_record_failure`, `_set_credentials`, `_approved_guest`) están revocadas para `anon` y `authenticated`.

**Storage:** buckets privados `party-photos` (rutas `{event_id}/{guest_id}/{archivo}`) y `post-images` (`{event_id}/{archivo}`). El invitado solo puede subir dentro de su propia carpeta; el organizador, solo en las de sus eventos. **Nunca el token en la ruta**: en la Fase 0 las rutas empezaban con el token del fotógrafo y `list_revealed_photos()` (pública, sin token) las devolvía, de modo que cualquiera con la clave anónima podía leer los tokens de quienes subieron fotos tras el revelado. El bucket `event-assets` para stickers llega en la Etapa 3.

**Por qué no JWT con claims:** el informe proponía sesión anónima con claims. Exigiría reescribir el flujo completo de invitados y no aporta aislamiento adicional mientras las RPC filtren por evento. Se difiere (junto con sesiones por dispositivo) a la Fase 2.

## Rutas del frontend

| Ruta Fase 0 | Fase 1 |
|---|---|
| `/i/:token` | **Desaparece.** Ver [`acceso-de-invitados.md`](./acceso-de-invitados.md). |
| `/evento` | `/e/:slug` — entrada del invitado: si no hay token guardado muestra "¿Quién eres?"; si lo hay, el hub (avisos, cámara, carrete). |
| `/como-llegar` | `/e/:slug/como-llegar` (datos del evento en BD, no en `routes.ts`) |
| `/admin` | `/admin` (lista de eventos del organizador) y `/admin/e/:eventId/{invitados,fotos,avisos,camara,ajustes}` |
| `/` redirige a `/i/invalido` | landing mínima o login de organizador |

`routes.ts` (rutas de "cómo llegar" codificadas) pasa a datos por evento (columnas de `events` o tabla propia).

## Despliegue: proyecto Supabase nuevo, sin tocar la Fase 0

`deploy.yml` ejecuta `supabase db push` contra el proyecto de producción cada vez que CI pasa en `main`. Para que la Fase 1 **no se aplique por accidente** sobre la base de la Fase 0, el esquema nuevo vive en `supabase/fase-1/migrations/` (el CLI no lo ve) con su propia suite de tests.

Plan de corte (pasos detallados y checklist de prueba en [`puesta-en-marcha.md`](./puesta-en-marcha.md)):

1. Crear un **proyecto Supabase nuevo** (el plan gratuito permite dos) y aplicarle `supabase/fase-1/migrations/`.
2. Mover `supabase/migrations/` a `supabase/legacy/fase-0/` y `supabase/fase-1/migrations/` a `supabase/migrations/`; apuntar los secrets `SUPABASE_*` al proyecto nuevo.
3. Dejar el proyecto viejo como archivo (o pausarlo). No hay migración de datos: el evento de la Fase 0 ya ocurrió. Si se quiere conservar algo, `pg_dump` del proyecto viejo antes de pausarlo.

Esto evita cualquier operación destructiva sobre producción.

## Tests

- Adaptar `supabase/tests/*` para crear un evento y colgar de él los datos.
- Test nuevo: dos organizadores y dos eventos; verificar que ninguna política/RPC cruza datos ni storage.
- Ver `supabase/README.md` para el arnés de Postgres en Docker.

## Mantener vivo el free tier

Supabase free pausa el proyecto tras 7 días sin actividad. Un workflow programado de GitHub Actions hace un `select 1` vía REST cada ~3 días.
