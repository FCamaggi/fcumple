# Plan de trabajo — Fase 1

Sin fechas fijas: un solo desarrollador, y el orden importa más que el calendario. Estimación gruesa: **8–12 semanas**.

## Etapa 1 — Esquema multi-tenant (hecha en la base; 76 tests)

- [x] Esquema nuevo en `supabase/migrations/`: `events`, `guests` (nombre y apellido obligatorios), `photos`, `posts`, `post_images`, RLS por dueño, buckets con rutas por `event_id`.
- [x] RPC: `register_guest` y `login_guest` (inscripción y sesión con nombre + PIN, hash bcrypt, bloqueo tras 5 PIN equivocados, freno de intentos), `get_event_public`, `get_guest_by_token`, `submit_rsvp`, `get_photo_quota`, `submit_photo`, `check_in_guest` (solo dueño), `list_revealed_photos(token)`, `get_public_headcount(slug)`, `list_published_posts(slug)`, `create_event`, `regenerate_guest_token` (restablece el acceso y borra el PIN).
- [x] Suite `npm run test:db` (101 tests, incluye la poda de la Fase 0): aislamiento entre dos organizadores, privilegios de `anon`, storage, inscripción y sesión con PIN. El arnés replica Supabase (pgcrypto en `extensions`), lo que detectó un `search_path` incorrecto que habría roto `create_event` y las altas en producción.
- [x] Paso de CI para la suite nueva.
- [x] Workflow de keep-alive (`.github/workflows/keepalive.yml`): ping de lectura cada 3 días; se activa con los secrets `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- [x] Repositorio reorganizado: la Fase 1 es `supabase/migrations/` y `supabase/tests/`; la Fase 0 pasó a `supabase/legacy-fase-0/` (sin sus tests). `prune-fase-0.sql` + test que reproduce el estado de producción de la Fase 0.
- [ ] **Lo hace el usuario:** respaldo, ejecutar la poda, vaciar los buckets, configurar Auth y `supabase db push`: pasos y checklist de prueba en [`puesta-en-marcha.md`](./puesta-en-marcha.md).

**Salida:** dos eventos de prueba aislados; un invitado se inscribe con el enlace único y usa las RPC.

## Etapa 2 — Frontend por evento y panel del organizador (en curso)

Hecho (primera rebanada: entrada del invitado):
- [x] `src/lib/platformApi.ts`: evento público, `registerGuest` / `loginGuest`, sesión del invitado en `localStorage` (token y nombre; nunca el PIN).
- [x] `/e/:slug` (`EventEntryPage`) con `IdentifyForm`: pestañas "Inscribirme" (nombre, apellido, PIN y repetirlo) y "Ya me inscribí" (nombre y PIN); maneja `name_taken`, `ambiguous`, `not_found`, `pending_approval`, `invalid`, `locked`, `needs_registration` y el límite de intentos.
- [x] Se eliminó la ruta de RUT (`rut.ts`, `/api/identify`, proveedores): ya no hace falta.

Hecho (segunda rebanada: panel del organizador, rutas `/panel` y `/panel/e/:eventId`):
- [x] `src/lib/organizerApi.ts`: eventos del organizador, alta con `create_event`, ajustes, invitados (alta masiva por líneas, aprobar/rechazar solicitudes, quitar, regenerar acceso con `regenerate_guest_token`).
- [x] `OrganizerEventsPage` (lista y alta) y `OrganizerEventPage` con pestañas **Invitados** (`GuestListPanel`), **Enlace** (`ShareEventLink`: copiar, un único mensaje de WhatsApp, QR descargable) y **Ajustes** (`EventSettingsPanel`: quién entra, cuándo se habilita la cámara, RSVP).
- [x] Migración `…100009_rpc_organizer` (`regenerate_guest_token`, solo dueño).
- [x] **Registro de organizadores** (`OrganizerLogin`): "Ya tengo cuenta" / "Crear cuenta" con correo y contraseña (mínimo 8, repetida), con aviso de confirmación de correo. `RequireAuth` acepta la pantalla de login a mostrar. `supabase/config.toml` activa el registro y la confirmación de correo (en el proyecto hosted se configura en el panel: ver [`puesta-en-marcha.md`](./puesta-en-marcha.md)).
- [x] Tope de **10 eventos por organizador** en `create_event` (el registro es abierto).

Hecho (tercera rebanada: hub del invitado en `/e/:slug`, `GuestHub`):
- [x] Avisos del evento (`list_published_posts`, con la galería incluida), aforo (`get_public_headcount(slug)`), cámara y rollo revelado (`list_revealed_photos(token)`), reutilizando `AnnouncementFeed`, `CameraCapture` y `RevealedRoll`.
- [x] Subida de fotos a `{event_id}/{guest_id}/…` (`uploadGuestPhoto`); el token nunca va en una ruta. `CameraCapture` y `usePhotoCapture` aceptan una subida inyectada (la Fase 0 sigue igual).
- [x] `camera_unlock = on_checkin`: la cámara queda bloqueada hasta que el organizador marque la llegada; el invitado muestra su código (QR con el token) y puede refrescar con "Ya me escanearon".
- [x] `CameraSection` extraído de `GuestPage` y compartido.

Hecho (cuarta rebanada: puerta y fotos en el panel del organizador):
- [x] Pestaña **Puerta** (`DoorPanel`): buscar por nombre sin tildes ni orden y marcar la llegada; escáner de QR (`QrScanner`, `check_in_guest`, que solo ejecuta el dueño).
- [x] Pestaña **Fotos** (`PhotosTab`): resumen por estado, moderación y **revelado del rollo** con `PhotoModerationPanel`, que ahora acepta una fuente de datos inyectada (la Fase 0 no cambia). `reveal` solo funciona si el rollo aún no estaba revelado.

Pendiente:
- [ ] Del hub: cuenta regresiva, "cómo llegar" por evento y RSVP (si `rsvp_enabled`). `GuestPage` y `EventHubPage` siguen con las RPC de la Fase 0.
- [ ] Panel del organizador, lo que falta: avisos (crear, publicar, imágenes) e importación CSV (poco necesaria ahora que los invitados se inscriben solos).
- [ ] Datos de "cómo llegar" por evento en vez de constantes en `routes.ts`.
- [ ] Retirar `/i/:token`, `SendInviteButton`, `WristbandCard` y `guests.phone` de la UI al hacer el corte.

> Hasta que se pode y se aplique la Fase 1 al proyecto Supabase, las rutas de la Fase 0 (`/i/:token`, `/evento`, `/admin`) y las nuevas (`/e/:slug`, `/panel`) hablan con esquemas distintos: cada una solo funciona contra la base que le corresponde. Después de la poda, las de la Fase 0 dejan de funcionar y se retiran cuando se haya portado lo que falta del hub.

## Etapa 3 — Marcos y stickers por evento (implementada; falta probar en iPhone/Android reales)

- [x] Tablas `event_frames` / `event_stickers`, bucket `event-assets`, RPC `list_event_camera_assets`.
- [x] `renderFrame` con las 6 plantillas, tipografías autoalojadas y ajuste de texto; validación de `FrameParams`.
- [x] Panel del organizador: editor de marcos con vista previa, selector de emojis, subida y procesamiento de imágenes, toggles por recurso y globales, orden, marco por defecto.
- [x] Cámara del invitado: carrusel desde datos del evento + bandeja y gestos de stickers + composición foto → stickers → marco en canvas.
- [ ] Retirar `public/marcos/*.png` (pendiente: se borran junto con el código de la Fase 0).
- [x] Tests de componentes y de DB (incluye: un invitado nunca ve recursos desactivados ni de otro evento).

## Etapa 4 — Moderación por lotes (1 sem)

- [ ] Agrupación por bloque en `PhotoModerationPanel`, aprobar/rechazar bloque, zona horaria del evento.

## Etapa 5 — Evento real y cierre (1 sem)

- [ ] Ensayo con ~80 invitados simulados (subidas y lecturas concurrentes).
- [ ] Revisión de seguridad: recorrer cada política y RPC con dos eventos.
- [ ] Revisar límites del free tier (BD, storage, egress) con datos reales.
- [ ] Evento real; actualizar `estado-actual.md` de la Fase 0 → pasa a documento de la plataforma.

## Dependencias

Etapa 2 depende de la 1. Las etapas 3 y 4 dependen de la 2 pero son independientes entre sí.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Borrar datos de la Fase 0 | Respaldo previo (`pg_dump`), el script corre en una transacción y un test lo reproduce contra una copia fiel de la Fase 0. |
| Política de Storage de la Fase 0 que sobrevive a la poda | El script borra todas las políticas de `storage.objects`; un test falla si ese paso se omite (demostrado). |
| Suplantación de un invitado | PIN con hash bcrypt, bloqueo de 10 minutos tras 5 PIN equivocados, freno de intentos por IP y evento, "Restablecer acceso" del organizador. |
| PIN corto (4 dígitos) | Aceptado: solo protege fotos de una fiesta; la tabla de credenciales no tiene permisos y hay bloqueo por intentos. |
| Canvas contaminado por imágenes de otro origen (stickers) | `crossOrigin="anonymous"` + CORS en el bucket; probar `toBlob` en Safari iOS desde el inicio. |
| Emojis distintos según dispositivo | Aceptado en el MVP (fuente nativa); conjunto abierto en la Fase 2 si molesta. |
| Fuga entre eventos por una RPC olvidada | Lista de verificación de todas las RPC y test de aislamiento. |
| Gestos de stickers en Safari iOS | Probar en dispositivos reales temprano; usar Pointer Events con `touch-action: none`. |
| Storage free (1 GB) se llena con fotos de resolución completa | Mantener la imagen liviana ya implementada (`display_storage_path`) y topes por evento. |
| Cámara/permisos en PWA iOS | Es una limitación conocida; probar en Safari real y documentar. |
