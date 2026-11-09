# Eventos con varios dueños

Objetivo: que un evento tenga varias cuentas organizadoras con los mismos permisos, sumadas con un link de invitación. Rama `feat/eventos-varios-duenos`, base 7df57dc.
Entrega: `ask-on-risk`. Tests: Vitest (`npm test`) y la suite de base de datos (`npm run test:db`, Postgres 16 en Docker o `FCUMPLE_TEST_PG_EXTERNAL=1`).

## Specs

- S1. «la cuenta quiero que sean los 3, hagamos el cambio ahora, es necesario ya que pueda ser multi owner»: un evento puede tener varios dueños, todos con los mismos permisos que hoy tiene el dueño único (ver, editar, borrar, moderar, Storage, RPC de organizador).
- S2. Forma de sumar dueños, elegida por el dueño: «Link de invitación (Recomendado)» — «Un dueño genera en Ajustes un link de un solo uso; la otra persona entra o se crea la cuenta y acepta. Sirve aunque la cuenta no exista todavía y no revela qué correos tienen cuenta.»
- S3. Contrato de base de datos (fijado por el orquestador, migración `20261109100023_event_owners.sql`):
  - Tabla `public.event_owners (event_id uuid → events on delete cascade, user_id uuid → auth.users on delete cascade, created_at timestamptz default now(), primary key (event_id, user_id))`. Relleno con `(id, owner_id)` de los eventos existentes. Trigger después de insertar en `events` que agrega `(new.id, new.owner_id)`. Sin acceso directo para `anon` ni `authenticated`.
  - `events.owner_id` queda como creador: no cambia de significado para el tope de 10 eventos de `create_event`, y un trigger impide modificarlo (`42501`).
  - `is_event_owner(p_event_id)` pasa a mirar `event_owners` con `auth.uid()`. Las 6 políticas `owner_all` que lo usan y las 3 de Storage lo heredan sin cambios.
  - Políticas de `events`: `select` con `owner_id = auth.uid() or is_event_owner(id)` (el `RETURNING` de un insert directo se evalúa antes del trigger); `insert` con `owner_id = auth.uid()`; `update` y `delete` con `is_event_owner(id)`.
  - Tabla `public.event_owner_invites (id, event_id → events on delete cascade, token_hash text unique, created_by, created_at, expires_at default now() + 7 días, used_at, used_by)`. Solo se guarda el hash sha256 del token, nunca el token. Sin acceso directo.
  - RPC `create_owner_invite(p_event_id uuid) returns text`: token aleatorio apto para URL (al menos 32 caracteres). No dueño: `42501`. Más de 5 invitaciones activas en el evento: `53400 'invite limit reached'`. Evento con 10 dueños: `53400 'owner limit reached'`.
  - RPC `accept_owner_invite(p_token text) returns uuid` (el `event_id`): sin sesión, `42501`; token inexistente, usado o vencido: `P0002 'invite not found'` (un solo error para no revelar el estado); si quien acepta ya es dueño, devuelve el `event_id` sin gastar la invitación; con 10 dueños, `53400 'owner limit reached'`. Si no, agrega el dueño y marca la invitación como usada.
  - RPC `list_event_owners(p_event_id uuid) returns table (user_id uuid, email text, is_creator boolean, is_me boolean, created_at timestamptz)`, ordenada por `created_at`. No dueño: `42501`.
- S4. Contrato del frontend:
  - `src/lib/organizerApi.ts`: `createOwnerInvite(eventId): Promise<string>`, `acceptOwnerInvite(token): Promise<string>`, `listEventOwners(eventId): Promise<EventOwner[]>` con `{ userId, email, isCreator, isMe, createdAt }`. Errores en español.
  - Ruta `/panel/unirse/:token` con `RequireAuth login={<OrganizerLogin />}` (el login se muestra en la misma URL, así que tras entrar o crear la cuenta se acepta solo). Acepta una vez y navega a `/panel/e/:eventId`. Error: «El link no es válido, ya se usó o venció. Pídele uno nuevo a quien te invitó.»
  - En Ajustes del evento, sección «Dueños»: lista con correo, «Tú» y «Creador», y el botón «Generar link de invitación», que muestra `${origin}/panel/unirse/<token>` con botón para copiar y el aviso «Sirve una vez y vence en 7 días.»

## Tasks

| ID | Specs | Ruta | Estado |
|---|---|---|---|
| T1 | S1, S3 | delegado: agy `gemini-4-argon-medium` (router `a7086d8408fe`), unidad paralela a T2 con superficie disjunta | Hecho (sin commit): migración 023, `event-owners.test.ts` (13 tests), `addOwner` en helpers, setup regenerado, arquitectura actualizada. El parent sumó la versión 023 a `prune.test.ts`. `test:db`: 16 archivos, 389 tests |
| T2 | S2, S4 | delegado: agy `gemini-4-argon-high` (router `662f4fd86d68`), worktree aislado (`worker/agy-333b29`, sin commits) | Hecho (sin commit): API, `/panel/unirse/:token`, sección «Dueños», tests y docs; integrado al worktree de la feature con `git apply` + copia de archivos nuevos. agy: foco 81 tests, suite 124 archivos / 1609 tests, typecheck ok |
| T3 | S1-S4 | inline + verificador independiente (riesgo ítems 1 y 2) | Hecho (sin commit): typecheck ok; `vitest` 124 archivos / 1609 tests; `test:db` 16 / 389; build ok. Verificador: S1-S4 cumplidos, sin bloqueantes. Corregida la advertencia 2 (import dinámico → estático; mocks en `OrganizerPages.test.tsx` y `EventSettingsPanel.test.tsx`) |

## Log

- L1 (2026-11-09): «1. apruebo commit, push y pr 2. 28 de noviembre, lugar aun no se, la cuenta quiero que sean los 3, hagamos el cambio ahora, es necesario ya que pueda ser multi owner 3. dame el link para darles luego del pr»
- L2 (2026-11-09): elección del dueño ante «¿Cómo se suma un segundo o tercer dueño a un evento?»: «Link de invitación (Recomendado)».
- L3: mapa del explorador. Propiedad = solo `events.owner_id`; 17 puntos de control, todos menos la política de `events` y `create_event` pasan por `is_event_owner` (`20261015100002_events.sql:38`). El frontend no lee `owner_id` (`listMyEvents` y `getMyEvent` confían en RLS). `RequireAuth` dibuja el login en la misma URL. Última migración: `20261102100022_frame_fonts_propias.sql`.
- L4: riesgo: ítem 1 (migración y relleno de datos) e ítem 2 (permisos, RLS y Storage). Lleva verificador independiente y review nativa.
- L5: T1 revisado por el parent: hash sha256, `for update` en la invitación, permisos por `is_event_owner`. Advertencias, no bloqueantes: el tope de 10 dueños se cuenta sin bloqueo (dos aceptaciones simultáneas podrían dejar 11), y `events.owner_id` sigue con `on delete cascade`, así que si el creador borra su cuenta se borra el evento aunque tenga co-dueños.
- L6: verificador independiente: S1-S4 cumplidos, 0 bloqueantes (sondas en base propia: escalada, tokens, concurrencia, invariante de datos tras rechazo, regresión de un dueño). Advertencias abiertas: con confirmación de correo activa, `signUp` (`src/lib/auth.ts:35`) no pasa `emailRedirectTo` y el invitado nuevo debe reabrir el link; la lista de dueños no se refresca sola; dos aceptaciones simultáneas del mismo usuario con dos invitaciones distintas dan `23505` (error genérico).
