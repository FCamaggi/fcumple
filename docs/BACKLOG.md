# Backlog

Backlog vivo e incremental — se actualiza a medida que se decide y se construye, no se reescribe borrando el historial de decisiones (salvo esta reescritura puntual del 2026-09-12, pedida explícitamente por el usuario tras un walkthrough real de la app: "creo que esta para repensar todo... quiero que limpies los documentos para que quede más actualizado a lo actual"). El contenido de las Etapas 1-3 de abajo describe lo que ya está construido y en producción — se conserva como registro de decisiones, no se borra.

## Estado real de la app (verificado por lectura de código, 2026-09-12)

Rutas existentes (`src/App.tsx`): **`/i/:token`** (invitación personal del invitado) y **`/admin`** (consola, protegida por `RequireAuth`). No existe ninguna ruta de "hub" público compartido.

Lo que ya funciona en producción:
- RF1–RF14 de `01-vision-y-requisitos.md` completos (CRUD de invitados, RSVP con +1, edición de respuesta ya enviada, headcount real, export/import CSV, `event_config` real).
- **Avisos** (`posts`): admin publica, se ven en un `AnnouncementTicker` dentro de `/i/:token` (no en un lugar separado).
- **Galería de fotos** (`photos` + Storage): cupo por invitado, moderación obligatoria, revelado post-evento manual. La sección de cámara en `/i/:token` solo se muestra si `guest.checkedInAt` no es null (gateada por check-in real, no por RSVP).
- **Check-in QR**: `/admin` tiene un modo "Escáner" de pantalla completa (mobile-first) que decodifica el QR del invitado y marca `checked_in_at`.

## Etapa 4 — Repensar arquitectura de información y flujos (NUEVA, sin construir)

El usuario probó el flujo real de punta a punta y encontró que las piezas de las Etapas 1-3 quedaron técnicamente correctas pero **desconectadas entre sí** — cada una resuelve su propio recorte sin que el conjunto se sienta como un flujo único y claro. Pidió explícitamente no seguir parchando de a una, sino repensar la arquitectura de información completa antes de seguir construyendo. Cuatro problemas concretos que dispararon esto:

### 4.1 Admin sin modo mobile real
Hoy `AdminPage` es un layout desktop-first con algunos breakpoints de Tailwind (`lg:grid-cols-3`), no una detección real de dispositivo. El escáner QR (única pieza ya rediseñada mobile-first, pantalla completa) demuestra que el resto del admin (Evento/Avisos/Fotos/DoorList/HeadcountMeter) necesita el mismo tratamiento cuando se abre desde un celular — el admin real de este proyecto va a estar parado en la puerta con el teléfono en la mano, no en un notebook, buena parte de la noche.

**Para la sesión nueva**: decidir si esto es "un layout admin responsive de verdad" (mismo código, mismo estado, breakpoints reales que reorganizan/priorizan secciones) o "dos experiencias admin" (una consola de escritorio completa + un modo puerta simplificado en mobile con solo Escáner/DoorList/HeadcountMeter). Es una decisión de arquitectura de UI, no un fix cosmético.

### 4.2 El invitado no sabe qué esperar después de confirmar
`ConfirmedScreen` (en `GuestPage.tsx`) dice "¡Estás adentro!" y no menciona nada sobre que la cámara se va a desbloquear recién cuando lo escaneen en la puerta. El invitado confirma, no tiene ninguna otra acción visible, y no hay ninguna pista de que algo más va a pasar. La función de cámara existe en el código pero es invisible/no descubrible para quien nunca la vio mencionada.

**Para la sesión nueva**: definir qué le mostramos al invitado ya confirmado antes del evento (¿un mensaje tipo "vas a poder sacar fotos cuando llegues y te marquemos en la puerta"? ¿algo más, como countdown al evento, o el hub de avisos?) — esto conecta directo con el punto 4.3.

### 4.3 No hay una vista general/hub para los invitados
Los avisos, la info del evento, y eventualmente el rollo de fotos revelado, todo vive embebido dentro de la página *personal* de cada invitado (`/i/{token}`), sin una superficie compartida donde "todos los invitados ven lo mismo" más allá de su propia tarjeta. La visión original del proyecto (`01-vision-y-requisitos.md` sección 8, `DESEO-DISENO-USUARIO.md` sección 8) hablaba de la app como un **hub**, pero nunca se construyó una ruta que sea ese hub — cada superficie nueva (avisos, fotos) se agregó *dentro* de la vista personal en vez de en un lugar común.

**Para la sesión nueva**: decidir si hace falta una ruta nueva (ej. algo enlazado desde `/i/:token` o un `/evento` público) que sea el punto de encuentro común — avisos, cuenta regresiva, lista de quién va (¿se muestra? ¿anónima o con nombres?), y el rollo revelado — separado de la tarjeta personal de cada invitado, o si la decisión correcta es mantener todo dentro de `/i/:token` pero reorganizado con mejor jerarquía. Ninguna de las dos es obviamente correcta sin pensarlo — es exactamente el tipo de decisión que esta etapa tiene que resolver antes de tocar código.

### 4.4 Los toasts (`SignalToast`) no se cierran solos
Confirmado en el código: `SignalToast` no tiene ningún timer de auto-dismiss, solo se cierra si el usuario lo toca o si el componente padre limpia el estado `message` manualmente. Es un bug de UX real y acotado (no una decisión de arquitectura) — se puede resolver rápido una vez que se retome el trabajo de código, no necesita repensarse a nivel de flujo.

## Cómo encarar la Etapa 4

Es explícitamente una etapa de **diseño/arquitectura de información primero, código después** — a diferencia de las Etapas 1-3, que ya llegaban con la decisión de producto resuelta y solo faltaba construir. Acá lo que falta es decidir la forma antes de construir nada, para no repetir el patrón de "piezas correctas por separado, flujo incoherente en conjunto" que motivó esta reescritura del backlog.
