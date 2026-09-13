# Estado actual de la app (fuente de verdad rápida)

> Última verificación por lectura de código: 2026-09-13. Si este documento y el código difieren, el código manda — actualizá esto en la siguiente sesión que toque algo relevante.

## Resumen del evento

Es un cumpleaños — un carrete sencillo en casa, **sin temática ni dresscode**. El flujo completo es: invitado recibe su link personal → confirma asistencia (o no) → si confirma, puede mostrar su QR en la puerta el día del evento → el admin lo escanea y eso habilita el modo cámara → el invitado saca fotos con su cupo limitado → las fotos pasan por moderación del admin → después del evento el admin revela el rollo para todos. No hay pulseras físicas, no se pide DNI, no hay control de acceso estricto por hora.

Datos reales del evento (ver `../05-comunicacion/PROMPTS-IMAGENES-AVISOS.md` y `../05-comunicacion/sistema-de-mensajes.md`):

| Campo | Valor |
|---|---|
| Evento | Cumpleaños Fabrizio |
| Fecha y hora | Viernes 9 de octubre de 2026, 22:00 hrs |
| Lugar | Pasaje Argentina 2299, Independencia |
| Corte de RSVP | 1 de octubre de 2026, 23:59 hrs |

## Rutas

- **`/i/:token`** — invitación personal del invitado: wristband, fader de asistencia (+1), nota, y tras confirmar, el bloque de cámara/QR de puerta y link al hub.
- **`/evento`** — hub público, sin token: countdown, feed de avisos (`AnnouncementFeed`), aforo total (solo número, nunca nombres), rollo revelado cuando exista.
- **`/admin`** — consola protegida (`RequireAuth`). En mobile se reduce a "modo puerta" (Escáner + `DoorList` + `HeadcountMeter`); en desktop es la consola completa (Evento, Avisos, Fotos, `DoorList`, `HeadcountMeter`).
- **`/i/dev-preview`** — invitado de desarrollo fijo, con `DevPanel` para probar el flujo sin tocar datos reales.

## Qué funciona en producción

- CRUD de invitados, RSVP con +1, edición de respuesta ya enviada, headcount real, export/import CSV, configuración del evento.
- Avisos con imagen de portada + galería (`posts`/`post_images`).
- Galería de fotos: cupo por invitado (`3 + plusOnesAllowed`, editable), moderación obligatoria antes del rollo, revelado post-evento manual por el admin.
- Check-in QR en la puerta: el invitado muestra su QR (`DoorQrOverlay`), el admin lo escanea desde `/admin` (con fallback manual si la cámara falla), y eso desbloquea la cámara del invitado en tiempo real.

## Qué NO existe (y es intencional)

- Sin tema/dresscode — campo legado sin uso en `event_config.theme` (ver `../02-arquitectura/02-arquitectura-tecnica.md`).
- Sin pulseras físicas ni control de DNI en la puerta.
- Sin hora de corte que bloquee el ingreso — el QR de puerta es festivo, no un control de acceso estricto.
- Sin envío automático/masivo de invitaciones — ver `../05-comunicacion/sistema-de-mensajes.md` para el asistente semi-manual por WhatsApp.

## Historial de decisiones y avance por etapas

El detalle completo de cada etapa construida (con evidencia de tests/build) vive en [`BACKLOG.md`](./BACKLOG.md) — no se duplica acá. Este documento es el resumen de "qué hay hoy", el backlog es el registro de "cómo se llegó hasta acá".
