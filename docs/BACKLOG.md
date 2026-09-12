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

## Etapa 4 — Resolución (decisiones tomadas 2026-09-12)

Antes de decidir se plantearon dos ejes con 1-2 arquitecturas concretas cada uno (ver historial de la sesión). Estas son las decisiones finales, tomadas por el usuario, no inferencias:

### Decisión 4.3 — Hub público nuevo en `/evento`
Se crea una ruta pública nueva, sin token, `/evento`: countdown al evento, avisos (`AnnouncementTicker`), y el rollo revelado cuando exista. Es el "punto de encuentro común" que la visión original (`DESEO-DISENO-USUARIO.md` sección 8) pedía y que nunca se construyó como superficie separada.

`/i/:token` deja de cargar avisos/rollo revelado embebidos y queda enfocado en lo personal: wristband, RSVP, estado, y un link visible hacia `/evento`.

Sub-decisiones de producto resueltas (no son inferencia técnica, son respuestas explícitas del usuario):
- **"Quién va" en `/evento`**: se muestra **solo el número** total de confirmados (ej. "38 en la lista"), nunca nombres. Cero exposición de datos personales de otros invitados.
- **Nivel de acceso de `/evento`**: **100% abierto**, sin token ni login — coherente con el tono ya establecido para el QR de puerta ("no es un evento oficial, no hay control de acceso estricto").

### Decisión 4.1 — Admin: "modo puerta" simplificado en mobile
`/admin` deja de ser un único layout comprimido por breakpoints. En mobile se muestra un **modo puerta** reducido con únicamente Escáner + `DoorList` + `HeadcountMeter` — las tres piezas que de verdad se usan la noche del evento, parado con el celular en la mano — con un link explícito para entrar a la consola completa si hace falta (editar evento, avisos, moderar fotos, exportar/importar). En desktop no cambia nada: sigue siendo la consola completa de siempre.

### Decisión 4.2 — Qué ve el invitado después de confirmar
`ConfirmedScreen` (`GuestPage.tsx`) suma un bloque explícito (no una línea suelta de texto) que anticipa que la cámara se desbloquea al llegar y ser escaneado en la puerta, con el mismo lenguaje de "entrada/acceso" del resto del proyecto. El CTA de esa pantalla pasa a incluir "ir al hub" (`/evento`), en vez de dejar al invitado sin ninguna acción visible tras confirmar.

### Decisión 4.4 — `SignalToast` auto-dismiss
`SignalToast` suma un timer de auto-dismiss (~4-5s), pausable si el usuario toca/hace hover sobre el toast, sin animación adicional si `prefers-reduced-motion` está activo. Es un fix acotado, sin decisión de arquitectura de por medio — se implementa junto con lo anterior.

### Qué queda para la implementación (no para esta sesión de arquitectura)
- Definir el nombre exacto y contenido final de `/evento` (componentes a reusar: `AnnouncementTicker`, `RevealedRoll` ya existen; hay que extraerlos de `GuestPage.tsx` y moverlos a la ruta nueva).
- Definir el criterio exacto de breakpoint para activar "modo puerta" en `AdminPage.tsx` y el copy/ubicación del link "ver consola completa".
- Definir el copy final del bloque nuevo en `ConfirmedScreen`.
- Todo esto se implementa con TDD real, separando escritor de revisor, en la siguiente fase de trabajo — no en esta sesión de arquitectura.

## Etapa 4 — Implementada y revisada (2026-09-12)

Las cuatro decisiones de la sección anterior ya están construidas, con TDD real (test antes del código en cada pieza) y revisión independiente en dos ciclos (escritor ≠ revisor). Evidencia: `npm run typecheck` limpio, `npm test` → 181/181 en 30 archivos, ambos corridos de forma independiente por el revisor, no solo reportados por quien implementó.

- **4.3 / `/evento`**: `src/pages/EventHubPage.tsx`, pública de verdad (sin `RequireAuth`, sin token), registrada en `src/App.tsx`. Muestra el headcount total de confirmados como un solo número (`PublicTally`, vía `getPublicHeadcount()` en `src/lib/eventApi.ts` → RPC `get_public_headcount()`), countdown al evento (`DoorCountdown`), `AnnouncementTicker`, y el rollo revelado extraído a `src/components/RevealedRoll.tsx`. Nueva RPC en `supabase/migrations/20260912100009_rpc_get_public_headcount.sql` (mismo patrón `security definer`/`search_path`/grant que `get_guest_by_token`), con test en `supabase/tests/headcount.test.ts`.
- **4.1 / modo puerta**: `src/pages/AdminPage.tsx` detecta mobile con `src/hooks/useIsMobile.ts` (`matchMedia`, breakpoint `< 768px`). En mobile se reduce a Escáner + `DoorList` + `HeadcountMeter`, con botón "Ver consola completa" y su simétrico "Volver al modo puerta" (ida y vuelta real, verificada). Desktop sin cambios.
- **4.2 / post-confirmación**: `ConfirmedScreen` en `src/pages/GuestPage.tsx` suma el bloque "Cámara // acceso: Bloqueada" explicando el desbloqueo en la puerta, más CTA a `/evento`. Avisos y rollo revelado ya no se cargan embebidos en `/i/:token`.
- **4.4 / `SignalToast`**: auto-dismiss a los ~4500ms, pausable con mouse (`onMouseEnter`/`onMouseLeave`) y con touch real (`onTouchStart`/`onTouchEnd`, agregado en la ronda de revisión — la primera entrega solo cubría mouse).

### Corrección sobre `test:db` (2026-09-13)
El punto anterior de esta sección (ya borrado) afirmaba que `npm run test:db` estaba roto por falta del schema `storage` en el Postgres de test — ese diagnóstico se hizo en un entorno local sandboxeado sin Docker funcional y resultó **incorrecto**. La corrida real en GitHub Actions (`ci.yml`, job `db-tests`, mismo `postgres:16-alpine`) lo desmiente: `photos.test.ts` (21 tests, usa `storage.buckets`), `rsvp.test.ts`, `posts.test.ts` y `checkin.test.ts` pasan todos limpios. El único fallo real era un bug propio en `supabase/tests/headcount.test.ts`: el helper `insertGuest` insertaba `plus_ones_confirmed: 1` (o `5`) sin subir `plus_ones_allowed` del default `0`, violando el `check (plus_ones_confirmed <= plus_ones_allowed)` de `guests` — nada relacionado con `storage` ni con ninguna migración preexistente. Corregido seteando `plus_ones_allowed` acorde en ese test. No queda deuda de entorno pendiente en `test:db` por este motivo.
