# Supabase — Fase 1 (multi-tenant)

Esquema de la plataforma multi-tenant. `supabase db push` (en `deploy.yml`) aplica `supabase/migrations/`. Cómo dejar el proyecto listo (podar la Fase 0, configurar Auth, aplicar estas migraciones y probar):
[`docs/fase-1-mvp-multitenant/puesta-en-marcha.md`](../docs/fase-1-mvp-multitenant/puesta-en-marcha.md).

`supabase/legacy-fase-0/` conserva las 27 migraciones de la Fase 0 (registro histórico; las usa el test de poda) y `prune-fase-0.sql`.

| Migración | Contenido |
|---|---|
| `…100001_foundations` | `pgcrypto`, token de invitado, `set_updated_at`, `name_tokens` (normalización de nombres), `slugify`, `random_suffix`, `safe_uuid`. |
| `…100002_events` | Tabla `events` (modo de acceso, desbloqueo de cámara, RSVP), `is_event_owner`, RLS del dueño. |
| `…100003_guests` | `guests` (nombre y apellido obligatorios, único por evento, aprobación), triggers, `guest_credentials` (hash del PIN, sin permisos) e `identify_attempts`. |
| `…100004_photos_posts` | `photos`, `posts`, `post_images` con `event_id` y claves foráneas compuestas. |
| `…100005_rpc_auth` | `register_guest` y `login_guest` (nombre + PIN), freno de intentos y bloqueo por invitado. |
| `…100006_rpc_guest` | RPC del invitado y del hub público, `check_in_guest` (solo dueño), `create_event`. |
| `…100007_storage` | Buckets `party-photos` y `post-images` con rutas por `event_id` y políticas por dueño / carpeta del invitado. |
| `…100008_rpc_organizer` | `regenerate_guest_token`: restablece el acceso (token y PIN); solo dueño del evento. |
| `…100009_camera_assets` | `event_frames` (marcos paramétricos validados en la base), `event_stickers` (emoji o imagen), topes por evento, `list_event_camera_assets`, ejemplos al crear un evento, bucket `event-assets`. |

No hay ninguna columna que guarde un RUT, correo, teléfono o PIN en claro (un test lo verifica). pgcrypto se instala en el esquema `extensions`, como en Supabase, y todas las funciones con `search_path` fijo lo incluyen.

`config.toml` es la configuración de Auth de la Fase 1: registro de organizadores abierto y confirmación de correo. Los invitados no usan Supabase Auth.

## Tests

```bash
npm run test:db                          # levanta Postgres 16 en Docker (puerto 55433)
FCUMPLE_TEST_PG_EXTERNAL=1 npm run test:db   # usa un Postgres ya levantado en 55433 (sin Docker)
```

Cada archivo reinicia el esquema `public` y reaplica todas las migraciones. El arnés imita los privilegios por defecto de Supabase (`anon`/`authenticated`/`service_role` reciben todo en `public`), de modo que un `revoke` olvidado en una migración hace fallar los tests.
