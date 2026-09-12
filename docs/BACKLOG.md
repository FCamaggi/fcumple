# Backlog

Backlog vivo e incremental — se actualiza a medida que se decide y se construye, no se reescribe borrando el historial de decisiones. Fuente de la ampliación de alcance: `DESEO-DISENO-USUARIO.md` sección 9 (avisos, galería con revelado, QR de puerta).

## Etapa 1 — Avisos / anuncios (`posts`) — EN CURSO

Superficie nueva: el admin publica avisos cortos ("cambió la hora", "el dresscode es tal"), los invitados los ven sin necesitar su token (contenido general del evento, no personalizado — igual que `event_config`).

- Tabla `posts`: `id`, `title`, `body`, `published_at` (null = borrador, solo visible para el admin), `created_at`.
- RLS: lectura pública solo de posts con `published_at` no nulo y `<= now()`; CRUD completo (incluidos borradores) solo `authenticated`.
- Admin (`/admin`): panel para crear/editar/publicar/despublicar/eliminar avisos.
- Invitado: componente `AnnouncementTicker` (ya nombrado en `DESIGN.md` §7.8) visible en `GuestPage` — marquesina de neón con los avisos más recientes, se expande al tocar.
- Sin Storage, sin RPC compleja — es el más simple de los tres, por eso va primero.

## Etapa 2 — Galería / rollo de fotos (`photos` + Storage) — DECIDIDO, no construido aún

Decisiones de producto ya tomadas (no re-abrir sin que el usuario lo pida — ver `DESEO-DISENO-USUARIO.md` §9):

- Cupo por invitado: campo `photo_quota` en `guests` (default 5, ajustable por el admin por invitado, igual que `plus_ones_allowed`).
- **Revelado post-evento**: nadie ve ninguna foto (ni siquiera quien la subió) hasta que el admin dispara "revelar el rollo" — flag global, probablemente en `event_config` (`photos_revealed_at timestamptz`) o una fila de configuración aparte.
- **Moderación obligatoria**: cada foto sube en estado `pending`; el admin aprueba o descarta antes del revelado. Solo fotos `approved` entran al rollo revelado.
- Modelo de datos propuesto (a validar por quien lo implemente):
  - Tabla `photos`: `id`, `guest_id` (FK a `guests`), `storage_path`, `status` (`pending`/`approved`/`rejected`), `created_at`.
  - Bucket de Supabase Storage (privado, no público) para los archivos — el acceso a los objetos también respeta el estado de revelado/aprobación, no alcanza con RLS de la tabla `photos` sola.
  - Subida: el invitado nunca tiene sesión, así que la subida se valida por token vía una RPC (mismo patrón que `submit_rsvp`) que chequea cupo restante antes de aceptar, análoga a como `submit_rsvp` valida `plus_ones_allowed`.
  - Compresión/resize en el cliente antes de subir (pregunta abierta original de `02-arquitectura-tecnica.md` §8.3) para no comerse la cuota de Storage del free tier con fotos de alta resolución.
- Frontend invitado: modo cámara in-app (`getUserMedia`), contador `FilmRollCounter` (`DESIGN.md` §7.9) mostrando cupo restante.
- Frontend admin: cola de moderación (aprobar/rechazar), botón "Revelar el rollo".
- Es la etapa más compleja de las tres (Storage + RLS de objetos + compresión de imagen client-side) — se aborda después de Avisos y QR, no en paralelo con ellas, para no arriesgar la seguridad de acceso a archivos por apuro.

## Etapa 3 — Check-in QR en la puerta — DECIDIDO, no construido aún

No existía en ningún documento antes de esta ronda. Decisiones tomadas:

- Escaneo **real pero simple**: cámara del celular del admin (`getUserMedia` + una librería de decodificación QR liviana, ej. `jsqr`), no un simulacro.
- El QR codifica el token del invitado (mismo token que ya existe en su `WristbandCard`/link) — no hace falta un formato nuevo, es el link `/i/{token}` o el token solo.
- Al reconocer un token válido: dispara una animación de bienvenida personalizada (nombre del invitado, color según su estado de RSVP — reusa la paleta ya establecida) y marca `checked_in_at` real en `guests` (columna nueva, se había sacado del tipo `Guest` en la ronda anterior por no estar implementada — vuelve ahora con propósito real).
- **Explícitamente no limitante**: no hay hora de corte que bloquee el check-in, no reemplaza el flujo de RSVP, es una capa festiva adicional en la puerta ("llegan tarde" es la única consecuencia posible, nunca un rechazo de acceso).
- Frontend admin: pantalla/modo "Escáner" en `/admin` con el feed de cámara y el overlay de bienvenida al reconocer un QR.
- Requiere `checked_in_at timestamptz nullable` en `guests` (migración pequeña) + mostrarlo en `DoorList` (chip "en la puerta" además del chip de estado de RSVP, sin depender solo del color, mismo criterio de accesibilidad ya usado en el resto del proyecto).

## Resuelto (rondas anteriores — se deja como registro, no como pendiente)

- RF1–RF14 de `01-vision-y-requisitos.md` completos, incluyendo RF7 (headcount real) y RF12 (editar RSVP ya enviado).
- Flash de color en fila de `DoorList` al cambiar de estado, code-splitting de `/admin`.
- Exportar/importar invitados por CSV con plantilla.
- `event_config` conectado a Supabase real (antes era mock).
