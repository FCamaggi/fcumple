# Supabase — Fase 1 (multi-tenant)

Esquema nuevo, **separado a propósito** de `supabase/migrations/` (Fase 0). El deploy (`.github/workflows/deploy.yml`) hace `supabase db push` solo de `supabase/migrations/`, así que nada de esto toca producción hasta el corte descrito en
[`docs/fase-1-mvp-multitenant/arquitectura-multitenant.md`](../../docs/fase-1-mvp-multitenant/arquitectura-multitenant.md) (proyecto Supabase nuevo).

| Migración | Contenido |
|---|---|
| `…100001_foundations` | `pgcrypto`, token de invitado, `set_updated_at`, `name_tokens` (normalización de nombres), `slugify`, `random_suffix`, `safe_uuid`. |
| `…100002_events` | Tabla `events` (modo de acceso, identificador, desbloqueo de cámara, RSVP), `is_event_owner`, RLS del dueño. |
| `…100003_guests` | `guests` (nombre y apellido obligatorios, único por evento, aprobación), triggers, `identify_attempts`. |
| `…100004_photos_posts` | `photos`, `posts`, `post_images` con `event_id` y claves foráneas compuestas. |
| `…100005_rpc_identify` | `identify_guest`, `identify_guest_verified` (solo `service_role`), núcleo compartido y freno de intentos. |
| `…100006_rpc_guest` | RPC del invitado y del hub público, `check_in_guest` (solo dueño), `create_event`. |
| `…100007_storage` | Buckets `party-photos` y `post-images` con rutas por `event_id` y políticas por dueño / carpeta del invitado. |
| `…100008_verified_lookup_quota` | `register_verified_lookup` (solo `service_role`): presupuesto de consultas del camino `rut_lookup`, antes de llamar a un proveedor de pago. |

No hay ninguna columna que guarde un RUT (un test lo verifica).

## Tests

```bash
npm run test:db:fase1                          # levanta Postgres 16 en Docker (puerto 55433)
FCUMPLE_TEST_PG_EXTERNAL=1 npm run test:db:fase1   # usa un Postgres ya levantado en 55433 (sin Docker)
```

Cada archivo reinicia el esquema `public` y reaplica todas las migraciones. El arnés imita los privilegios por defecto de Supabase (`anon`/`authenticated`/`service_role` reciben todo en `public`), de modo que un `revoke` olvidado en una migración hace fallar los tests.
