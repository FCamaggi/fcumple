# Plan de trabajo — Fase 1

Sin fechas fijas: un solo desarrollador, y el orden importa más que el calendario. Estimación gruesa: **8–12 semanas**.

## Etapa 1 — Esquema multi-tenant y migración (3–5 sem)

- [ ] Migración `events` + `event_id` en `guests`, `photos`, `posts`, `post_images`.
- [ ] Migrar el evento actual como evento #1 (sin tocar tokens).
- [ ] Reescribir políticas RLS por `owner_id` y adaptar las RPC de invitado (derivan `event_id` del token; las globales reciben slug).
- [ ] Mover/adaptar rutas de Storage con prefijo `event_id`.
- [ ] Adaptar `supabase/tests/*` y agregar test de aislamiento entre dos organizadores.
- [ ] Workflow de keep-alive para Supabase free.

**Salida:** el evento actual funciona idéntico; dos eventos de prueba aislados.

## Etapa 2 — Frontend por evento y panel del organizador (2–3 sem)

- [ ] Contexto de evento en el frontend; rutas `/e/:slug`, `/admin`, `/admin/e/:eventId/...`.
- [ ] Crear/listar/editar eventos (nombre, fecha, lugar, slug).
- [ ] Datos de "cómo llegar" y hub por evento en vez de constantes en `routes.ts`.
- [ ] Adaptar capa `lib/*Api.ts` para pasar `eventId`/`slug`.

## Etapa 3 — Marcos y stickers por evento (2–3 sem)

- [ ] Tablas `event_frames` / `event_stickers`, bucket `event-assets`, RPC `list_event_camera_assets`.
- [ ] Biblioteca `builtin` con los 7 marcos actuales.
- [ ] Panel del organizador: toggles por recurso y globales, orden, marco por defecto, subida de recursos propios, vista previa.
- [ ] Cámara del invitado: carrusel desde datos del evento + bandeja y gestos de stickers + composición en canvas.
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
| Romper el evento actual al migrar | Migración en transacción, copia de seguridad previa (`pg_dump`), tests de la Fase 0 corriendo contra el nuevo esquema. |
| Fuga entre eventos por una RPC olvidada | Lista de verificación de todas las RPC y test de aislamiento. |
| Gestos de stickers en Safari iOS | Probar en dispositivos reales temprano; usar Pointer Events con `touch-action: none`. |
| Storage free (1 GB) se llena con fotos de resolución completa | Mantener la imagen liviana ya implementada (`display_storage_path`) y topes por evento. |
| Cámara/permisos en PWA iOS | Es una limitación conocida; probar en Safari real y documentar. |
