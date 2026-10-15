# Plan de trabajo — Fase 1

Sin fechas fijas: un solo desarrollador, y el orden importa más que el calendario. Estimación gruesa: **8–12 semanas**.

## Etapa 1 — Esquema multi-tenant (hecha en la base; 76 tests)

- [x] Esquema nuevo en `supabase/fase-1/migrations/`: `events`, `guests` (nombre y apellido obligatorios), `photos`, `posts`, `post_images`, RLS por dueño, buckets con rutas por `event_id`.
- [x] RPC: `identify_guest` (3 modos de acceso, freno de intentos), `identify_guest_verified` (solo `service_role`, no recibe RUT), `get_event_public`, `get_guest_by_token`, `submit_rsvp`, `get_photo_quota`, `submit_photo`, `check_in_guest` (solo dueño), `list_revealed_photos(token)`, `get_public_headcount(slug)`, `list_published_posts(slug)`, `create_event`.
- [x] Suite `npm run test:db:fase1`: aislamiento entre dos organizadores, privilegios de `anon`, storage, identificación.
- [x] Paso de CI para la suite nueva.
- [ ] Workflow de keep-alive para el Supabase gratuito (se pausa a los 7 días sin actividad).
- [ ] Crear el proyecto Supabase nuevo y aplicar las migraciones (ver plan de corte en `arquitectura-multitenant.md`).
- [ ] **Decisión pendiente:** proveedor de identidad **con contrato** para `rut_lookup` (el raspador de nombrerutyfirma.com fue evaluado y descartado, ver `docs/estrategia/`). Hasta entonces, solo `name`.

**Salida:** dos eventos de prueba aislados; un invitado se identifica con el enlace único y usa las RPC.

## Etapa 2 — Frontend por evento y panel del organizador (en curso)

Hecho (primera rebanada: entrada del invitado):
- [x] `src/lib/platformApi.ts`: evento público, identificación por nombre y por RUT, sesión del invitado en `localStorage` (token y nombre; nunca RUT).
- [x] `/e/:slug` (`EventEntryPage`) con `IdentifyForm` ("¿Quién eres?"): nombre y apellido, o RUT según el evento; maneja `ok`, `ambiguous`, `not_found`, `pending_approval` y el límite de intentos.
- [x] `src/lib/rut.ts`: formato y dígito verificador.
- [x] `POST /api/identify` (`api/identify.ts` + `src/server/identifyHandler.ts`): resuelve RUT → nombre con un proveedor inyectado y llama a `identify_guest_verified`. Consume el presupuesto de consultas (`register_verified_lookup`) antes de gastar una llamada al proveedor. **Sin proveedor configurado responde 501**: no hay ninguno registrado.

Hecho (segunda rebanada: panel del organizador, rutas `/panel` y `/panel/e/:eventId`):
- [x] `src/lib/organizerApi.ts`: eventos del organizador, alta con `create_event`, ajustes, invitados (alta masiva por líneas, aprobar/rechazar solicitudes, quitar, regenerar acceso con `regenerate_guest_token`).
- [x] `OrganizerEventsPage` (lista y alta) y `OrganizerEventPage` con pestañas **Invitados** (`GuestListPanel`), **Enlace** (`ShareEventLink`: copiar, un único mensaje de WhatsApp, QR descargable) y **Ajustes** (`EventSettingsPanel`: quién entra, cuándo se habilita la cámara, RSVP).
- [x] Migración `…100009_rpc_organizer` (`regenerate_guest_token`, solo dueño).
- Requisito de despliegue: en el proyecto Supabase nuevo hay que **habilitar el registro de usuarios** (`enable_signup`) para que los organizadores puedan crear su cuenta; `supabase/config.toml` de la Fase 0 lo tiene apagado porque había un solo admin. El alta de cuentas de organizador (pantalla de registro) queda pendiente.

Pendiente:
- [ ] Hub del invitado en `/e/:slug` (avisos, cámara, rollo, cuenta regresiva, cómo llegar) migrado a las RPC de la Fase 1: `list_published_posts`, `get_public_headcount(slug)`, `list_revealed_photos(token)`, rutas de Storage `{event_id}/{guest_id}/…`. Hoy `GuestPage` y `EventHubPage` siguen usando las RPC de la Fase 0.
- [ ] Panel del organizador, lo que falta: importación CSV, moderación de fotos y revelado del rollo, avisos, escáner de puerta / `check_in_guest` y registro de cuentas de organizador. "Mi QR" del invitado para la puerta.
- [ ] Datos de "cómo llegar" por evento en vez de constantes en `routes.ts`.
- [ ] Retirar `/i/:token`, `SendInviteButton`, `WristbandCard` y `guests.phone` de la UI al hacer el corte.

> Mientras no se haga el corte a un proyecto Supabase nuevo, las rutas de la Fase 0 (`/i/:token`, `/evento`, `/admin`) y la ruta nueva `/e/:slug` hablan con esquemas distintos: cada ruta solo funciona contra la base que le corresponde.

## Etapa 3 — Marcos y stickers por evento (2–3 sem)

- [ ] Tablas `event_frames` / `event_stickers`, bucket `event-assets`, RPC `list_event_camera_assets`.
- [ ] `renderFrame` con las 6 plantillas, tipografías autoalojadas y ajuste de texto; validación de `FrameParams`.
- [ ] Panel del organizador: editor de marcos con vista previa, selector de emojis, subida y procesamiento de imágenes, toggles por recurso y globales, orden, marco por defecto.
- [ ] Cámara del invitado: carrusel desde datos del evento + bandeja y gestos de stickers + composición foto → stickers → marco en canvas.
- [ ] Retirar `public/marcos/*.png` (archivados en `assets/marcos/`).
- [ ] Tests de componentes y de DB (incluye: un invitado nunca ve recursos desactivados ni de otro evento).

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
| Afectar la producción de la Fase 0 al desplegar | El esquema nuevo vive en `supabase/fase-1/` (fuera del `db push`) y se aplica a un proyecto Supabase nuevo. |
| Suplantación o prueba masiva de nombres | Enlace no adivinable, límite de intentos por IP y evento, regeneración de token por el organizador. |
| Verificación por RUT con costo y requisitos legales | Opcional y desactivada: el MVP corre solo con `name`; si se activa, el RUT no se persiste y el proveedor se revisa contractualmente. |
| Canvas contaminado por imágenes de otro origen (stickers) | `crossOrigin="anonymous"` + CORS en el bucket; probar `toBlob` en Safari iOS desde el inicio. |
| Emojis distintos según dispositivo | Aceptado en el MVP (fuente nativa); conjunto abierto en la Fase 2 si molesta. |
| Fuga entre eventos por una RPC olvidada | Lista de verificación de todas las RPC y test de aislamiento. |
| Gestos de stickers en Safari iOS | Probar en dispositivos reales temprano; usar Pointer Events con `touch-action: none`. |
| Storage free (1 GB) se llena con fotos de resolución completa | Mantener la imagen liviana ya implementada (`display_storage_path`) y topes por evento. |
| Cámara/permisos en PWA iOS | Es una limitación conocida; probar en Safari real y documentar. |
