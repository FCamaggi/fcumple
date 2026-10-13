# Plan de trabajo — Fase 1

Sin fechas fijas: un solo desarrollador, y el orden importa más que el calendario. Estimación gruesa: **8–12 semanas**.

## Etapa 1 — Esquema multi-tenant y migración (3–5 sem)

- [ ] Respaldo (`pg_dump`) y migraciones que reemplazan el esquema de la Fase 0 por `events` + `event_id` en `guests`, `photos`, `posts`, `post_images` (sin migrar datos).
- [ ] RPC `identify_guest` (RUT normalizado y validado, límite de intentos), `request_access`, modos de acceso.
- [ ] Reescribir políticas RLS por `owner_id` y adaptar las RPC de invitado (derivan `event_id` del token; las globales reciben slug).
- [ ] Mover/adaptar rutas de Storage con prefijo `event_id`.
- [ ] Adaptar `supabase/tests/*` y agregar test de aislamiento entre dos organizadores.
- [ ] Workflow de keep-alive para Supabase free.

**Salida:** dos eventos de prueba aislados; un invitado se identifica por RUT con el enlace único y usa las RPC existentes.

## Etapa 2 — Frontend por evento y panel del organizador (2–3 sem)

- [ ] Contexto de evento en el frontend; rutas `/e/:slug`, `/admin`, `/admin/e/:eventId/...`.
- [ ] Crear/listar/editar eventos (nombre, fecha, lugar, slug).
- [ ] Datos de "cómo llegar" y hub por evento en vez de constantes en `routes.ts`.
- [ ] Adaptar capa `lib/*Api.ts` para pasar `eventId`/`slug`.
- [ ] Pantalla "¿Quién eres?" con RUT, `ShareEventLink` (enlace + QR + mensaje único), importación CSV con `rut`, búsqueda por nombre/RUT en la lista de puerta, "mi QR" para el check-in.
- [ ] Retirar `/i/:token`, `SendInviteButton` y `guests.phone` de la UI.

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
| Borrar datos de producción al reiniciar el esquema | Respaldo `pg_dump` y confirmación explícita antes de ejecutar. |
| Suplantación o prueba masiva de RUT | Enlace no adivinable, límite de intentos por IP y evento, mensajes genéricos, regeneración de token por el organizador. |
| RUT es dato personal | Pedirlo solo en modos que lo necesitan, solo visible al organizador, borrado con el evento, aviso en pantalla. |
| Canvas contaminado por imágenes de otro origen (stickers) | `crossOrigin="anonymous"` + CORS en el bucket; probar `toBlob` en Safari iOS desde el inicio. |
| Emojis distintos según dispositivo | Aceptado en el MVP (fuente nativa); conjunto abierto en la Fase 2 si molesta. |
| Fuga entre eventos por una RPC olvidada | Lista de verificación de todas las RPC y test de aislamiento. |
| Gestos de stickers en Safari iOS | Probar en dispositivos reales temprano; usar Pointer Events con `touch-action: none`. |
| Storage free (1 GB) se llena con fotos de resolución completa | Mantener la imagen liviana ya implementada (`display_storage_path`) y topes por evento. |
| Cámara/permisos en PWA iOS | Es una limitación conocida; probar en Safari real y documentar. |
