# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Invitado (usuario principal, el que más usa la app).** Recibe un enlace de invitación a un cumpleaños, crea su usuario y confirma asistencia. En la fiesta se activa con el QR y toma fotos con los marcos y stickers del evento, desde su celular, compartiendo red con decenas de personas (eventos de hasta ~80 invitados). Su trabajo: sacar las fotos que valen la pena dentro de un cupo limitado, y después ver y descargar el rollo revelado.

**Organizador (secundario, pero la app no funciona sin él).** Arma el evento desde `/panel`: configura marcos y stickers, descarga el QR para la fiesta, habilita la cámara, modera las fotos por lotes horarios y las revela.

## Product Purpose

Una cámara de fotos para eventos al estilo cámara desechable ("burn camera"); el primer cliente es un cumpleaños. Cada invitado tiene un cupo de fotos, así que importa qué fotografiar y cuándo. Las fotos no se publican al instante: el organizador las modera y las revela. Éxito: los invitados llegan a la cámara sin fricción el día de la fiesta, y el organizador obtiene un rollo moderado, con la identidad visual de su cumpleaños.

## Positioning

- Cada evento tiene su propia cámara: el organizador configura colores y textos de los marcos y sus stickers (emojis e imágenes propias). La intención es que los marcos sean muy personalizables, con alcance por definir.
- Cupo limitado y revelado moderado, en vez de una galería compartida abierta. El cupo es una decisión de diseño y también un límite técnico.
- Se entra por navegador, sin instalar una app.

## Operating Context

El flujo previsto: el organizador manda la invitación por enlace; cada invitado crea su usuario y confirma asistencia. El día de la fiesta, el QR sirve para activar las funcionalidades (check-in y cámara), no para entrar. Hay eventos en vivo con mucha gente en la misma red. El organizador prepara el evento antes, descarga el QR, y durante la fiesta usa el panel (también para check-in y moderación).

## Capabilities and Constraints

Existe hoy (verificado en el código el 2026-10-17):
- Inscripción e inicio de sesión de invitados por nombre y PIN de 4 a 6 números, con bloqueo tras 5 intentos fallidos y tope de 500 invitados por evento. Entrada por `/e/:slug`.
- Cámara con cupo de fotos por invitado (5 por defecto), marcos y stickers por evento, con toggles por recurso.
- Moderación por lotes horarios, revelado del rollo y descarga de fotos.
- Anuncios del evento, RSVP opcional (apagado por defecto), check-in con escáner y desbloqueo de la cámara al entrar o al hacer check-in.
- Panel multi-evento del organizador (`/panel`, `/panel/e/:eventId`).

Restricciones vigentes:
- Hoy ninguna columna guarda RUT, correo, teléfono ni PIN en claro, y un test lo verifica; el PIN va con hash bcrypt. Cambiarlo exige modificar ese test y documentarlo en `docs/fase-1-mvp-multitenant/`.
- Sin pagos ni planes por ahora (Fase 2).
- Supabase (Postgres, Auth, Storage, RLS) sin backend propio; SPA estática en Vercel.
- Identificación del invitado: se mantiene **nombre y apellido con PIN** (decisión de 2026-10-18, sobre las alternativas de correo opcional o enlace personal). Si alguien olvida el PIN, el organizador restablece su acceso. Cualquier cambio exige antes revisar el test que prohíbe guardar correo o teléfono.
- Alcance (decisión de 2026-10-18, entrevista de marca en `docs/marca/`): el producto es para **eventos festivos e informales** (cumpleaños, carretes, matrimonios que terminan en carrete), no solo cumpleaños; quedan fuera los eventos formales, masivos y los funerales. Las fotos de todos deben verse **durante el evento y también tras el revelado**. Hoy solo existe lo segundo; verlas durante el evento necesita el muro en vivo (Fase 3, ítem 3.1) o un revelado por bloques.
- El enlace `/i/:token` es legado de la Fase 0, pendiente de retirar según la decisión D10 (`docs/estrategia/decisiones-de-alcance.md`).

Planeado, sin decidir (no es capacidad actual):
- Likes por foto: cada usuario puede dar uno.
- Carrusel de fotos en la sección de anuncios, estilo Instagram: máximo 10 fotos, carga diferida (lazy).
- Mejora de la calidad de las fotos que se descargan; la calidad de la vista previa importa menos.
- Nombre del producto: se está dejando de usar "fcumple" porque el producto será para cualquier cumpleaños. Nombre nuevo por decidir.
- Este producto es genérico; cada cumpleaños concreto vive en su propia rama (la primera es `francisca`) y no debe acoplarse al producto.

## Brand Commitments

Interfaz, mensajes y documentación en español. Nombre del producto por decidir (ver arriba).

## Evidence on Hand

Documentación en `docs/` (empezando por `docs/README.md`, que no es la fuente de verdad total: confirmar contra el código), la imagen `public/og-image.jpg` y los marcos en `public/marcos/`. No hay testimonios, clientes, métricas de eventos reales ni precios, y no se deben inventar.

## Product Principles

1. El cupo y el revelado son el producto: la escasez de fotos es una decisión de diseño y también técnica.
2. El día de la fiesta nadie debe quedar bloqueado: entrar y recuperar el acceso tiene que ser rápido.
3. El organizador controla la experiencia de su evento (marcos, stickers, moderación) sin tocar código.
4. Lo específico de un cumpleaños no se casa con el producto: cada evento se configura en su propia rama o evento.
5. La privacidad del invitado se respeta por defecto, y cualquier dato personal nuevo se decide de forma explícita.
