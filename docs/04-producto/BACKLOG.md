# Backlog

> Reubicado a `docs/04-producto/BACKLOG.md` el 2026-09-13 como parte de la reestructura de documentación por intención (ver `../README.md`). Las referencias a rutas de otros documentos dentro de las Etapas 1-6 de abajo (escritas antes de la reestructura) pueden usar los nombres viejos sin carpeta — el contenido no se tocó, solo se movió el archivo.

Backlog vivo e incremental — se actualiza a medida que se decide y se construye, no se reescribe borrando el historial de decisiones (salvo esta reescritura puntual del 2026-09-12, pedida explícitamente por el usuario tras un walkthrough real de la app: "creo que esta para repensar todo... quiero que limpies los documentos para que quede más actualizado a lo actual"). El contenido de las Etapas 1-3 de abajo describe lo que ya está construido y en producción — se conserva como registro de decisiones, no se borra.

## Estado real de la app (verificado por lectura de código, 2026-09-12)

Rutas existentes (`src/App.tsx`): **`/i/:token`** (invitación personal del invitado) y **`/admin`** (consola, protegida por `RequireAuth`). No existe ninguna ruta de "hub" público compartido.

Lo que ya funciona en producción:
- RF1–RF14 de `01-vision-y-requisitos.md` completos (CRUD de invitados, RSVP con +1, edición de respuesta ya enviada, headcount real, export/import CSV, `event_config` real).
- **Avisos** (`posts`): admin publica, se ven en un `AnnouncementTicker` dentro de `/i/:token` (no en un lugar separado).
- **Galería de fotos** (`photos` + Storage): cupo por invitado, moderación obligatoria, revelado post-evento manual. La sección de cámara en `/i/:token` solo se muestra si `guest.checkedInAt` no es null (gateada por check-in real, no por RSVP).
- **Check-in QR**: `/admin` tiene un modo "Escáner" de pantalla completa (mobile-first) que decodifica el QR del invitado y marca `checked_in_at`.

## Etapa 7 — Reestructura de documentación, sin dresscode, y envío por WhatsApp (2026-09-13)

El usuario confirmó que el evento **no tiene temática ni dresscode** — es un carrete de cumpleaños simple — y pidió tres cosas: (1) reestructurar toda la documentación por intención/etapa en vez de un único directorio plano, (2) alinear la app quitando cualquier rastro de "tema/dresscode", y (3) un sistema para mandar los links personalizados a los invitados, más avisos reales (con fecha/hora/lugar) para la cartelera.

Decisiones tomadas con el usuario (respuestas explícitas, no inferencias):
- **Dresscode**: se saca de todas las pantallas (`EventSettingsForm`, `WristbandCard`, `GuestPage`), pero la columna `event_config.theme` se deja en la base sin borrar (legado, ver `../02-arquitectura/02-arquitectura-tecnica.md`).
- **Envío de invitaciones**: asistente semi-manual con links `wa.me` (mensaje precargado, el admin elige el contacto y envía a mano) — se descartó explícitamente WhatsApp Business API por costo/setup desproporcionado. Detalle en `../05-comunicacion/sistema-de-mensajes.md`.

Trabajo de esta etapa:
- **Documentación**: reestructurada en `docs/01-vision/` … `docs/06-operaciones/` (ver `../README.md`). `docs/NEXT-SESSION-PROMPT.md` (de la Etapa 4, ya resuelta) se eliminó por obsoleto. `docs/v01/` (staging temporal de una sesión anterior, nunca comiteado) se fusionó dentro de la nueva estructura.
- **`docs/05-comunicacion/PROMPTS-IMAGENES-AVISOS.md`**: reescrito con los datos reales del evento (Cumpleaños Fabrizio, viernes 9 de octubre 2026 22:00 hrs, Pasaje Argentina 2299 Independencia, corte de RSVP 1 de octubre) y una advertencia explícita sobre la fiabilidad de texto en imágenes generadas por IA.
- **Código**: sacado "Tema / dresscode" de `EventSettingsForm.tsx`, `WristbandCard.tsx`, `GuestPage.tsx`, `types.ts` (`EventInfo.dresscode`) y `mocks/event.ts` — `EventConfig.theme` queda intacto en `eventApi.ts` como campo legado sin uso en UI. Agregado `SendInviteButton.tsx` (nuevo, con test), integrado en `DoorList.tsx` solo en vista completa (no modo puerta) y cableado desde `AdminPage.tsx`.

**Evidencia**: TDD real (test antes del código), implementación con `agency-frontend-developer`, revisión independiente con `agency-code-reviewer` (escritor ≠ revisor). Un hallazgo 🟡 de la revisión (`DoorList.tsx` usaba `guest.token ?? guest.id` como fallback para el link de invitación — código muerto hoy, pero un link roto silencioso si algún día se disparaba) corregido: ahora `SendInviteButton` no se renderiza si `guest.token` es falsy, en vez de sustituir por `guest.id`. `npm run typecheck` limpio, `npm test` → 253/253 en 38 archivos (más 12/12 re-verificados tras el fix puntual), `npm run build` sin errores.

### Ronda 2 (mismo día): imágenes reales, tono chileno, y envío directo por teléfono

El usuario probó lo anterior y trajo tres correcciones reales:

1. **Imágenes de avisos**: el usuario generó 3 imágenes siguiendo `docs/05-comunicacion/PROMPTS-IMAGENES-AVISOS.md`. Se detectaron y corrigieron dos errores propios en esa documentación: (a) los prompts pedían 4:5 pero `AnnouncementFeed.tsx` recorta toda portada a 16:9 — corregido; (b) una imagen incluía una pulsera física como ícono, contradiciendo que el evento es 100% web sin objetos físicos — corregido, reemplazada por un celular con QR. Imágenes finales en `assets/avisos-fuente/` (fuera de `public/`, que se despliega tal cual a producción). Preview visual armado como artifact aparte para validar antes de subir nada a Supabase.
2. **Tono**: el usuario es chileno, no argentino — se corrigió voseo real encontrado en `PostsPanel.tsx` ("podés" → "puedes") y en la copy de posts propuesta en `PROMPTS-IMAGENES-AVISOS.md`. Se sacó una línea de copy que el usuario marcó como "fome" y se agregó una nota sobre extras (más acompañantes, comida, estacionamiento, alojamiento).
3. **`SendInviteButton` — 3 fixes reales tras probarlo**: (a) los emoji del mensaje salían como mojibake en WhatsApp real — se reemplazaron los glifos literales por escapes `\u{...}` explícitos, blindaje contra encoding al editar el archivo desde otro entorno; (b) el mensaje ahora usa solo el primer nombre del invitado (`firstName()`, separa por el primer espacio tras trim); (c) se agregó `guests.phone` (columna nueva, nullable, opcional, migración `20260913120000_add_phone_to_guests.sql`) para que el botón abra directo la conversación de ese contacto (`wa.me/{numero}`) en vez de que el admin elija el contacto a mano cada vez — si no hay teléfono cargado, sigue funcionando como antes. `phone` es admin-only: nunca se expone a `get_guest_by_token`/`submit_rsvp` ni a ninguna pantalla guest-facing (verificado con test de DB dedicado), y no aparece en ninguna columna visible de `DoorList`.

**Evidencia**: TDD real, implementación con `agency-frontend-developer`, revisión independiente con `agency-code-reviewer`. Un hallazgo 🟡 (`GuestEditModal`/`AdminPage` guardaba `''` en vez de `null` al borrar el teléfono) corregido: `handleSave` ahora normaliza a `null`. `npm run typecheck` limpio, `npm test` → 271/271 en 38 archivos, `npm run build` sin errores, `npm run test:db` → 74/74 en 8 archivos (Docker real, incluye `guests-phone.test.ts`).

## Etapa 8 — QA del usuario (2026-09-14), pendiente de scoping: cámara dedicada

El usuario hizo un QA manual del flujo de invitado (`docs/08-QA/140920260509.md`) y encontró, entre otras cosas, un pedido grande: que `CameraCapture` deje de sentirse "un componente nomás" y simule de verdad una cámara — pantalla completa al usarla, zoom, enfoque, detección de orientación, opciones de flash, y posiblemente marcos/elementos fijos superpuestos para encuadrar la foto.

**Por qué no se implementa en esta sesión**: es un pedido de UX de hardware, no un bug acotado — zoom/enfoque/flash dependen de `MediaTrackCapabilities` de la API de cámara del navegador, cuyo soporte real varía fuerte entre Chrome Android, Safari iOS y desktop (Safari iOS en particular tiene soporte muy limitado de torch/zoom por `getUserMedia`). Antes de construir esto hace falta decidir: alcance mínimo viable (¿full-screen + orientación alcanza para la v1, dejando zoom/flash como "si el dispositivo lo soporta, si no se oculta el control"?), y probarlo en dispositivos reales, no solo en desktop. Queda anotado para una sesión dedicada de scoping + implementación, no para resolverse de pasada.

Los otros 3 hallazgos del mismo QA (argentinismo, formulario que se pierde al salir de la página, y invitación+cámara mostrándose juntas por un bug de datos) sí se resuelven en esta sesión — ver más abajo.

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

## Etapa 5 — Hallazgos de uso real, pendientes de implementar (2026-09-13)

El usuario probó el flujo ya en producción (llenó la configuración real del evento y recorrió la invitación) y encontró cuatro problemas concretos. Se anotan acá tal como se pidieron — **sin implementar nada todavía**, cada uno con la evidencia de código que lo confirma, para retomarlos en una sesión de trabajo futura.

### 5.1 — "Talón de control" en `WristbandCard`: QR decorativo sin función + DNI innecesario
`src/components/WristbandCard.tsx:79-105`. La sección "Talón de control" (visible siempre que `compact` sea `false`, o sea en la pantalla de RSVP) muestra una barra de barras decorativas y un cuadrado con el texto literal `"QR"` (línea 97-99) — **no hay ningún generador de QR real en el proyecto**: `package.json` solo tiene `jsqr` (decodificador, usado por `QrScanner.tsx` del admin), ninguna librería de generación de QR. El invitado nunca ve un QR escaneable de verdad en ningún lugar — el único QR real del flujo es el que el propio admin decodifica en `/admin` a partir del link/token del invitado (ver `src/lib/qrToken.ts`), no algo que se le muestre a él. Además el texto fijo `"Presentar DNI físico + código directo en puerta"` (línea 101-103) pide un documento que el usuario confirmó que no hace falta.

**Qué pidió el usuario**: si esta sección es puramente estética, hacerla más sutil (bajarle el protagonismo al cuadrado "QR" y a la etiqueta "Talón de control") o sacar directamente la mención al QR/el botón si no aporta; sacar la línea de DNI.

**Nota técnica para cuando se retome**: esto conecta con el punto 4.2 ya resuelto (el aviso de que la cámara se desbloquea al escanear en la puerta) — hay que decidir si esta sección se simplifica a una referencia textual liviana ("te van a reconocer en la puerta con tu link/token") en vez de fingir un QR que no existe, en vez de construir un generador de QR real solo para esto (no pedido, no parte del alcance decidido).

### 5.2 — Información del evento no refleja lo que el admin configuró
Dos bugs relacionados, ambos confirmados por lectura de código:

- **El horario nunca llega a la pantalla del invitado.** `EventSettingsForm.tsx` solo tiene un campo `Fecha del evento` (`datetime-local`, guarda fecha+hora completas en `event_config.event_date`) — no existe ningún campo separado de "horario de puertas". Pero en `src/pages/GuestPage.tsx`, la función `toEventInfo()` (línea 23-36) hardcodea `doorsTime: NOT_SET` (`"Por confirmar"`) sin leer nunca la hora de `eventConfig.eventDate`, y `formatEventDate()` (línea 38-44) formatea la fecha con `{ weekday: 'short', day: '2-digit', month: 'short' }` — **sin `hour`/`minute`**, así que la hora que el admin ingresó (ej. 22:00 del 09-10-2026) queda guardada en la base pero no se muestra en ningún lado de `/i/:token`. Esto es lo que se ve como "Puertas por confirmar" en `WristbandCard`.
- **La cuenta atrás de RSVP solo muestra horas, nunca días.** `src/components/RsvpDeadlineStrip.tsx:23,38`: `hoursRemaining = Math.floor(remainingMs / 3_600_000)` y el texto es siempre `"Quedan {N}h para confirmar"` — con un deadline a varios días de distancia (ej. del 13-09 al 01-10) esto muestra un número de horas grande en vez de "X días Y horas".

**Qué pidió el usuario**: pulir esta sección completa en base a los datos reales que ingresó — que el horario configurado se vea reflejado donde corresponde, y que el tiempo restante se exprese en días + horas, no solo horas.

### 5.3 — El crossfader (`FaderToggle`) salta a "NO VOY" al primer toque en vez de partir centrado
`src/components/FaderToggle.tsx`. El valor inicial del invitado es `'neutral'` (`STATUS_TO_FADER` en `GuestPage.tsx` mapea `pending` → `'neutral'`), que `positionFor()` (línea 14-18) ubica correctamente en el centro (`travel / 2`). Pero el motion value `x` se inicializa en `useMotionValue(0)` (extremo izquierdo, "NO VOY") y solo se anima hacia el centro dentro de un `useEffect` (línea 45-48) que depende de que `trackRef.current.offsetWidth` ya esté medido. Si el usuario toca/arrastra el knob antes de que esa animación de entrada termine, `handleDragEnd()` (línea 50-55) calcula el `ratio` a partir del valor de `x` en ese instante — que puede seguir cerca de `0` — y lo redondea a `'no'` (`ratio < 0.33`). Esto coincide exactamente con el reporte: "al interactuar con el inmediatamente se va al NO VOY" en vez de quedar en el centro.

**Qué pidió el usuario**: que el fader parta siempre al medio, de forma confiable, sin ese salto a "NO VOY" apenas se interactúa.

### 5.4 — Tono del copy: pasar a algo más neutro/chileno en toda la página
El usuario no quiere el slang tipo "Me aBRO" (`src/components/FaderToggle.tsx:60`, label `"Out / Me abro"`) ni frases como `"Se prendieron las luces. Nos vemos en la pista."` (`src/pages/GuestPage.tsx`, `ConfirmedScreen`) — pide un pase de tono más neutro/chileno en **toda** la página, no solo estos dos ejemplos puntuales (son solo los que señaló como muestra). Antes de reescribir copy, conviene relevar todas las strings de tono "carrete/discoteca" existentes en `GuestPage.tsx`, `AdminPage.tsx`, `WristbandCard.tsx`, `FaderToggle.tsx`, `SignalToast` (los mensajes de éxito/error armados en cada página) y `EventHubPage.tsx`, y decidir junto al usuario cuáles se mantienen (el tono "discoteca" sigue siendo la dirección de `DESIGN.md` sección 10) y cuáles se cambian por sonar forzadas o poco naturales en Chile — esto es una decisión de copy, no solo una traducción mecánica.

### Cómo encarar la Etapa 5
A diferencia de la Etapa 4, estos cuatro puntos no requieren repensar arquitectura de información — son bugs/pulido concretos y acotados (5.1, 5.2, 5.3 tienen causa raíz ya identificada en el código; 5.4 es una pasada de copy). Se pueden implementar con TDD real igual que la Etapa 4, probablemente sin necesitar el mismo nivel de decisión de producto previa — salvo 5.4, donde conviene mostrarle al usuario la lista completa de strings encontradas antes de reescribirlas, para no imponer un tono que tampoco le guste.

### 5.5 — Header de `/admin` desbordado en mobile (hotfix post-Etapa 5)
El usuario probó el modo puerta (Decisión 4.1) en su celular real después del deploy y confirmó que sí se activaba, pero el `<header>` de `AdminPage.tsx` se veía "muy mal": era un solo `flex` sin wrap pensado para desktop, y con el logo + 3 botones (Escáner / Ver consola completa / Cerrar sesión) se desbordaba en pantallas angostas.

**Implementado**: el header pasa a `flex-col` en mobile y `sm:flex-row` desde el breakpoint de Tailwind; el contenedor de botones (`data-testid="admin-header-actions"`) suma `flex-wrap`. Cambio puramente de clases responsive, sin tocar la lógica de `doorMode`. Test nuevo en `AdminPage.test.tsx` verifica ambas clases con el viewport mockeado a mobile.

### 5.6 — QR de puerta con refresh-on-close (pedido nuevo del usuario)
El usuario propuso simular el flujo "invitado muestra QR → admin escanea → se liberan acciones" de forma más fluida: un botón que muestra el QR real de pantalla completa, y que cerrarlo (únicamente con un botón "Cerrar", nunca por backdrop) dispare un refresh silencioso del guest — así si lo escanearon mientras el QR estaba abierto, cerrar revela el check-in/cámara desbloqueada sin que el invitado tenga que pensar en recargar la página.

**Implementado**: `src/components/DoorQrOverlay.tsx` (nuevo, lazy-loaded desde `GuestPage.tsx`, reusa la librería `qrcode` ya agregada en Etapa 5 para `DevPanel`) genera un QR real de `${origin}/i/{token}`. El botón "Mostrar mi QR en la puerta" aparece en `ConfirmedScreen` mientras `checkedIn` sea falso; al confirmarse el check-in el mismo bloque cambia a "Desbloqueada" y el botón desaparece. Cerrar el overlay llama `handleQrClosed()` en `GuestPage.tsx`, que vuelve a pedir `getGuestByToken`/`getPhotoQuota` (con catch silencioso, a diferencia del fetch inicial) y resincroniza fader/+1/nota — mismo patrón que ya usa `handleDevGuestChange` para el invitado DEV.

**Evidencia**: TDD real en ambos (test antes del código), revisión independiente sin hallazgos. `npm run typecheck` limpio, `npm test` → 213/213 en 35 archivos, `npm run build` confirma `DoorQrOverlay` como chunk separado (1.29 kB) fuera del bundle principal.

### 5.7 — `DoorList` desbordada en modo puerta (segundo hotfix mobile)
Con el header ya arreglado (5.5), el usuario mandó una captura real del modo puerta en su celular: la tabla de `DoorList` (7 columnas, `min-w-[720px]`) quedaba cortada/ilegible, mostrando apenas 2 columnas y un borde de color sin contexto — el punto entero del modo puerta es ser usable parado con el teléfono, y una tabla ancha con scroll horizontal no lo es.

**Implementado**: `DoorList.tsx` suma un prop `compact` — en `compact`, la tabla se reemplaza por una lista de tarjetas apiladas (`DoorListCard`) con solo lo esencial: nombre + badge DEV si aplica, token, chip de estado, +N, check-in, nota si existe, y un botón "Editar" que dispara el mismo `onEditGuest` de siempre. `AdminPage.tsx` pasa `compact={doorMode}` — en desktop no cambia nada (sigue la tabla completa). Filtros y buscador de `DoorList` no se tocaron, ya eran responsive.

### 5.8 — Escaneo real del QR de puerta no funcionaba
El usuario probó el flujo de punta a punta (invitado muestra QR de `DoorQrOverlay` → admin abre `/admin` → Escáner → apunta la cámara) y "no pasó nada". Confirmó que usó el escáner real de `/admin`, no la cámara nativa del celular — descartando el error de uso más común.

**Causa encontrada por lectura de código**: `DoorQrOverlay.tsx` generaba el QR con `QRCode.toDataURL(link, { margin: 1, width: 320 })` — un margen de 1 módulo, muy por debajo del mínimo de 4 que recomienda el estándar QR. Una zona de silencio angosta es una causa real y conocida de que un escaneo pantalla-contra-pantalla falle en la práctica (glare, autofoco de la cámara), aunque el mismo QR decodifique bien en una captura estática. `DevPanel.tsx` (el QR del invitado DEV) nunca tuvo este problema porque usa el default de la librería (`margin: 4`).

**Implementado**:
- `DoorQrOverlay.tsx`: `margin` corregido a `4`.
- `QrScanner.tsx`: además del fix de raíz, se agregó un fallback manual (input de texto + botón "Verificar") que reusa exactamente el mismo `handleDetected` de `useQrCheckIn` — si la cámara falla por cualquier motivo (luz, ángulo, un celular viejo), el admin puede escribir el token o pegar el link a mano sin quedar bloqueado.

**Evidencia**: TDD real, `npm run typecheck` limpio, `npm test` → 218/218 en 35 archivos.

### 5.9 — Bug real de persistencia: la cámara nunca se desbloqueaba para el invitado (raíz del "no pasó nada" al cerrar el QR)
El fix de 5.8 arregló el escaneo en sí (el admin veía el nombre correcto), pero el usuario reportó que después de cerrar el QR el invitado seguía sin ver ninguna función nueva desbloqueada. Causa real, preexistente a esta sesión: `get_guest_by_token`/`submit_rsvp` (las RPC que usa la página del invitado) **nunca devolvían `checked_in_at`** — `src/lib/guestApi.ts` lo hardcodeaba a `null` siempre, sin importar lo que hubiera en la base. Consecuencia: un invitado real NUNCA podía ver su cámara desbloqueada después de que lo escanearan — ni cerrando el QR, ni recargando la página, ni en ningún momento. Solo `check_in_guest` (llamada por el escáner del admin) conocía el valor real, y ese valor jamás volvía al invitado.

**Implementado**:
- Migración `supabase/migrations/20260913110000_expose_checked_in_at_to_guest.sql`: ambas RPCs recreadas devolviendo `checked_in_at`.
- `supabase/migrations/20260911120006_rpc_get_guest_by_token.sql` y `20260911120007_rpc_submit_rsvp.sql` (archivos históricos): se agregó `drop function if exists` antes de su `create or replace` — mismo comportamiento en una aplicación normal, pero necesario para que el arnés de test (que reaplica todas las migraciones desde cero en cada archivo, sobre el mismo Postgres compartido) no choque contra el cambio de tipo de retorno de la migración nueva.
- `src/lib/guestApi.ts`: `mapRow` lee `row.checked_in_at` real en vez de hardcodearlo.
- Verificado explícitamente que el fetch inicial de `GuestPage.tsx`, `handleQrClosed`, `handleSubmit` y `handleDevGuestChange` reflejan siempre el guest recién recibido de la API, sin pisar `checkedInAt` con un valor viejo.

**Evidencia**: TDD real (2 tests nuevos en `supabase/tests/rsvp.test.ts` que reproducen el bug exacto: check-in vía scanner → `get_guest_by_token` refleja `checked_in_at`; y que sobrevive a una edición posterior del RSVP). `npm run test:db` → 70/70. Revisión independiente confirmó el fix de punta a punta (montaje inicial y recarga de página también quedan correctos, no solo el cierre del QR).

## Etapa 6 — Cartelera rediseñada, posts con imagen/galería, cupo de fotos por fórmula (2026-09-13)

Rediseño completo de `/evento` pedido por el usuario tras ver la versión anterior (aforo como número gigante protagonista, avisos como ticker chico casi invisible).

- **Posts con autoría rica**: `public.posts` suma `subtitle`/`cover_image_path`; tabla nueva `public.post_images` (galería, RLS: público solo si el post está publicado); bucket `post-images` (privado, solo `authenticated` sube/borra, lectura vía función puente `post_image_path_is_public`). Migraciones `20260913100000_posts_images.sql` y `20260913100001_storage_post_images.sql`, 14 tests nuevos.
- **`PostsPanel.tsx`**: subtítulo, subida de portada, subida de galería (múltiples archivos), miniaturas — con `PostImageThumb`, que resuelve la URL firmada antes de renderizar (ver corrección de seguridad abajo).
- **`AnnouncementFeed.tsx`** (nuevo) reemplaza a `AnnouncementTicker.tsx` (borrado, sin usos): tarjetas con imagen, título, subtítulo, cuerpo completo y tiempo relativo ("hace Xh/Xd"), galería si corresponde.
- **`EventHubPage.tsx`**: el feed de avisos pasa a ser el contenido principal; `PublicTally`+`DoorCountdown` se fusionaron en `EventStatusStrip`, un chip de contexto en vez del elemento central. El aforo sigue siendo solo un número, nunca nombres.
- **Cupo de fotos = `3 + plusOnesAllowed`, editable**: `CreateGuestModal.tsx` precarga la fórmula y deja de recalcular en cuanto el admin toca el campo a mano (`quotaTouched`); `GuestEditModal.tsx` lo deja editable sin recálculo automático (invitado existente). `guests.photo_quota` ya existía, sin cambio de esquema — es lógica de frontend.
- **Post-guía sembrado como borrador**: "Guía rápida: qué podés hacer acá", redactado según lo pedido, para que el usuario lo revise antes de publicar (sin imagen de portada todavía — ver `docs/PROMPTS-IMAGENES-AVISOS.md` para el prompt de generación).
- **Prompts de imagen**: no genero imágenes en este entorno — quedaron en `docs/PROMPTS-IMAGENES-AVISOS.md` (post-guía y, opcional, post-invitación), con la paleta exacta del proyecto.

### Corrección de seguridad encontrada en revisión: imágenes de posts nunca cargaban
`getPostImageUrl` usaba `getPublicUrl()` sobre un bucket (`post-images`) creado como **privado** — ese endpoint de Storage ignora RLS por completo y solo sirve el archivo si el bucket tiene `public=true`, así que toda la infraestructura de RLS recién construida quedaba inútil: las imágenes no cargaban para nadie, publicado o no. Corregido a `createSignedUrl` (mismo patrón que `getSignedPhotoUrl` en `photosApi.ts`), con un componente `PostImageThumb` en `PostsPanel.tsx` y resolución asíncrona en `AnnouncementFeed.tsx` para que ningún `<img>` intente usar la URL antes de que se resuelva.

**Evidencia**: TDD real en cada pieza, revisión independiente en dos ciclos (el segundo solo para confirmar el fix del bug de imágenes). `npm run typecheck` limpio, `npm test` → 247/247 (37 archivos), `npm run test:db` → 70/70 (7 archivos), `npm run build` sin errores.

**Evidencia**: TDD real (3 tests nuevos en `DoorList.test.tsx` + 1 de integración en `AdminPage.test.tsx`), `npm run typecheck` limpio, `npm test` → 217/217 en 35 archivos.

## Etapa 5 — Implementada y revisada (2026-09-13)

Los cuatro puntos están construidos con TDD real y revisión independiente (un solo ciclo, sin hallazgos bloqueantes). Evidencia: `npm run typecheck` limpio, `npm test` → 208/208 en 34 archivos, `npm run test:db` → 54/54 en 6 archivos (Docker real), `npm run build` sin errores — todo corrido de forma independiente por el revisor.

- **5.1**: `WristbandCard.tsx` — sacado el cuadrado "QR" decorativo, la barra de barritas falsa y la línea de DNI. Queda un texto honesto: "Te van a reconocer con tu link personal en la puerta."
- **5.2**: `doorsTime` en `GuestPage.tsx` ahora refleja la hora real de `eventConfig.eventDate` (antes hardcodeado a "Por confirmar"). `RsvpDeadlineStrip.tsx` muestra días+horas cuando falta un día o más, solo horas si falta menos (pulso de urgencia bajo 48h intacto).
- **5.3**: `FaderToggle.tsx` — el motion value `x` ahora se fija sincrónicamente en el primer montaje (`useLayoutEffect` + `x.set()`), sin la ventana async que permitía leer una posición vieja si el usuario interactuaba de inmediato. `animate()` con resorte queda solo para cambios posteriores de `value`.
- **5.4**: "Out / Me abro" → "Out / No voy" (unificado con el resto del componente); "Se prendieron las luces. Nos vemos en la pista." → "Ya quedaste en la lista. Nos vemos ahí." Pendiente sin resolver a propósito (no es bug, es una decisión de tono): `EventHubPage.tsx` conserva "Ya se prendieron las luces" en el countdown público — es un contexto distinto (anuncio del evento, no confirmación personal) y coincide con el motivo de `DESIGN.md` §6.2; queda para que el usuario confirme si también quiere cambiarlo.

### Herramienta nueva: invitado DEV (`/i/dev-preview`)
Se agregó un invitado real y fijo para poder probar todo el flujo de invitado sin los límites normales, sin tocar datos reales del evento:

- Migración `supabase/migrations/20260913090000_dev_guest_support.sql`: columna `guests.is_dev` (default `false`, solo se activa por este seed o a mano en SQL — no hay ningún camino de escritura público que lo alcance, verificado en la revisión), invitado semilla `token = 'dev-preview'` con `plus_ones_allowed = 10` y `photo_quota = 999`, y RPC `dev_reset_guest(p_token)` (pública pero solo puede modificar filas con `is_dev = true` — reseteo verificado como no-op contra un invitado real en `supabase/tests/dev-guest.test.ts`).
- `get_public_headcount()` excluye a `is_dev` — el invitado DEV nunca infla el número público de `/evento`. `AdminPage.tsx` excluye también al invitado DEV de sus tallies (`confirmed`/`pending`/`declined`/`realHeadcount` y el total del `HeadcountMeter`) y lo marca con un badge "DEV" en `DoorList`.
- En `/i/dev-preview` aparece además un `DevPanel` (franja de advertencia, claramente no-parte-de-la-experiencia-de-invitado) con: ver confirmado/no voy, reiniciar (borra fotos, vuelve a pendiente, quita check-in), simular check-in, link a una pantalla de token inválido, y un QR real (librería `qrcode`) que codifica el link del propio invitado dev, para poder escanearlo con el escáner real del admin desde otro dispositivo. `DevPanel` se carga con `React.lazy` — confirmado en la revisión que aparece como chunk separado en `npm run build` y que ningún invitado real lo descarga.
