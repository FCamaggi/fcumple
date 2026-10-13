# Moderación por lotes horarios (Fase 1)

## Qué es

El panel de moderación agrupa las fotos pendientes en **bloques de tiempo** (por defecto 1 hora; configurable por evento: 30 min / 1 h / 2 h) para que el organizador revise el evento de forma secuencial.

## Base existente

`src/lib/photoTimeline.ts` ya agrupa fotos por hora para la cartelera, y `photoModerationQueue.ts` ordena la cola. Se reutiliza la lógica de agrupación y se aplica al panel `PhotoModerationPanel`.

## Comportamiento

- Encabezado por bloque ("21:00 – 22:00 · 12 pendientes") con acciones **Aprobar todo el bloque** / **Rechazar todo el bloque** además de la acción por foto.
- Zona horaria del **evento** (campo `events.settings.timezone`, por defecto `America/Santiago`), no la del dispositivo del organizador.
- La auto-aprobación por invitado de Fase 0 (`guests.auto_approve_photos`) se mantiene: esas fotos no entran a la cola.
- Sin cambios en el revelado: sigue siendo manual por el organizador.

## Fuera de alcance

Gestos de swipe tipo tarjeta, roles de moderador delegados, aprobación automática por rol VIP (cubierta de forma más simple por el flag existente). Ver Fase 2.
