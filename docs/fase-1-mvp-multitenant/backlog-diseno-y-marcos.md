# Backlog: diseño móvil, marcos nuevos y vistas previas para la organizadora

Origen: pedido del dueño del producto el 2026-10-23, después de desplegar la cámara por QR, la cartelera y el estilo por evento. Este documento es el punto de partida de la sesión de diseño. Qué existe hoy y qué no: [`estado-del-producto.md`](./estado-del-producto.md). Reglas del sistema visual: `DESIGN.md` y `PRODUCT.md` en la raíz.

## Por qué existe este backlog
- **Nadie ha visto la app en un teléfono real.** El dueño usa el computador; los invitados y la clienta la van a usar casi solo en el celular. Todo lo verificado hasta ahora fue con Chromium y WebKit simulados (Playwright), no con un iPhone ni un Android reales.
- **Los marcos no funcionan como máscaras.** Lo que se intentó (orejas de conejita, antifaz sobre la cara) exige que el adorno calce con la cara de cada persona, y eso es muy difícil y se ve mal. Los marcos nuevos **no se alinean a personas**.
- **La organizadora trabaja a ciegas.** No puede ver lo que ve el invitado: ni la cámara bloqueada o activa, ni la cartelera con los avisos actuales, ni cómo quedará un aviso nuevo antes de publicarlo.

## Restricciones (no se negocian)
- Interfaz y mensajes en español. Esquinas rectas, un acento fuerte por pantalla, tres voces tipográficas (Anton, Space Grotesk, Space Mono). Ver `DESIGN.md`.
- El estilo de cada evento es un preset de `src/lib/theme.ts` con el contraste AA verificado por test. Los marcos de la cámara dibujan en un canvas con sus propios colores (`event_frames.params`), independientes del estilo.
- **Ninguna columna guarda RUT, correo, teléfono ni PIN en claro** y un test lo verifica.
- El repositorio es **público**: nada de datos de clientes. `docs/clientes/` está en `.gitignore`.
- Un cambio de esquema lleva su migración y su test de base de datos; las migraciones las aplica el Deploy al llegar a `main`.
- Cualquier previsualización para la organizadora **no puede exponer** el `activation_code`, tokens de sesión ni crear invitados o fotos reales.
- Probar en móvil de verdad antes de dar algo por terminado (ver la épica A).

## Épica A. Revisión móvil (invitada, invitado y organizadora)

Objetivo: saber cómo se ve y se siente la app en un teléfono, y arreglar lo que moleste. Entregable: un informe con capturas por pantalla y una lista de arreglos.

**A1. Matriz de pruebas.** iPhone con Safari, Android con Chrome, y el navegador interno de WhatsApp (donde se abrirá el enlace). Tamaños: 360×640, 390×844, 430×932; vertical y horizontal. Sin dispositivos físicos: WebKit y Chromium de Playwright (están en `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`), y pedirle al dueño que pruebe en su teléfono lo que el simulador no puede.

**A2. Recorridos del invitado.** Abrir el enlace → inscribirse (con acompañante, comentario, pregunta) → entrar → ver cartelera → escanear el QR (cámara normal del teléfono) → activar la cámara → sacar una foto con marco → cupo agotado → ver el carrusel de fotos publicadas → volver a entrar con nombre y PIN desde otro celular.

**A3. Recorridos de la organizadora.** Entrar al panel → cada una de las 9 pestañas (Invitados, Avisos, Fotos, Activación, Cámara, Enlace, Inscripción, Puerta, Ajustes) → revisar fotos una por una (swipe) → publicar un lote → crear un aviso con imágenes → imprimir/descargar el QR.

**A4. Sospechas conocidas (verificar primero):**
- **Zoom automático de iOS:** los campos de texto usan `text-sm` (14 px). Safari en iPhone hace zoom al enfocar un campo de menos de 16 px. Puede arruinar el formulario de inscripción.
- Las 9 pestañas del panel hacen `flex-wrap`: ocupan varias filas en el celular. Pensar una navegación móvil (pestañas con scroll horizontal, o agrupar).
- Las superposiciones de pantalla completa (`fixed inset-0`: cámara, moderación, visor) y `100vh` con la barra del navegador móvil; áreas seguras (`viewport-fit=cover`, notch).
- Texto de 10–11 px (etiquetas en Space Mono) y su legibilidad al aire libre y de noche.
- Objetivos táctiles de al menos 44 px; botones pequeños de las listas (Aprobar, Quitar, Restablecer acceso).
- `PostsPanel` viene de la Fase 0: no se diseñó para móvil y su estética es anterior.
- El carrusel de fotos y el de la galería de avisos (scroll-snap) en Safari iOS; carga diferida con `IntersectionObserver`.
- Peso de la página en una red compartida por decenas de personas (el bundle principal pasa de 500 kB; las fuentes de Google se cargan siempre).
- La cámara: permisos, orientación, torch, rendimiento del canvas al componer el marco, tamaño del JPG.

**A5. Criterio de listo.** Cada recorrido se recorre de punta a punta en WebKit iPhone y Chromium Android sin pasos confusos, sin desbordes horizontales, sin zoom inesperado, y con las capturas guardadas en el informe.

## Épica B. Marcos reinventados

Objetivo: marcos que se vean **hechos**, no formas raras, y que nunca dependan de calzar con una cara.

**B1. Principio.** Un marco es **composición**, no máscara: decora los bordes y deja libre el centro de la foto. Lo que va sobre las personas son solo los stickers que el invitado coloca a mano.

**B2. Catálogo nuevo (a diseñar y priorizar).** Ideas del dueño y propuestas:
- **Marcos de borde** pulidos: grosor, esquinas, título, fecha, lugar; con la zona central siempre libre.
- **Marco «selfie»**: pensado para una persona al centro-arriba; deja un recuadro limpio y pone los adornos en los costados y el borde inferior; versión vertical y versión horizontal.
- **Marco configurado de antemano que rota de posición**: la organizadora elige un marco y varias posiciones (esquinas, lados) y el marco va cambiando de posición en cada foto, por invitado o por hora, para que el rollo tenga variedad sin que nadie lo elija.
- **Varios marcos por evento** que rotan automáticamente (cada disparo pasa al siguiente) o que el invitado elige.
- **Polaroid** y **tira de fotomatón** (varias fotos en una tira), si el costo lo justifica.
- **Plantillas listas de calidad** en vez de un editor de capas libre: pocos parámetros (colores, texto, posición) y resultado siempre bien compuesto. El editor de capas actual (`LayerEditor`) sigue siendo el origen de las «formas raras»; decidir si se oculta, se limita o se retira.

**B3. Garantías de calidad.**
- Zona segura: el centro libre (por ejemplo el 70 % central) en vertical, horizontal, cámara frontal y trasera.
- Los textos nunca se cortan ni se salen; tipografías cargadas antes de dibujar; borde sin dientes en pantallas de alta densidad (DPR).
- «Lo que ves es lo que recibe el invitado»: la vista previa del panel dibuja con el mismo código que la cámara.
- Las fotos no se alteran (sin grano, viraje ni filtros): el marco es solo un borde. Ver «La Regla del Foco en la Foto» en `DESIGN.md`.

**B4. Datos y compatibilidad.** `event_frames` guarda `template` (lista cerrada: `border`, `polaroid`, `film`, `viewfinder`, `banner`, `glow`, `capas`) y `params jsonb` validado en SQL (`valid_frame_params`, `valid_frame_layers`) y en TypeScript (`src/lib/cameraAssets/frames.ts`, `layers.ts`), con un test de paridad. Una plantilla nueva exige tocar las dos validaciones, la migración y el test. Decidir qué pasa con los marcos que ya existen en eventos reales (los de `capas`).

**B5. Rendimiento móvil.** Tamaño del canvas, memoria y límites de canvas en Safari iOS, calidad y tamaño del JPG (`toBlob`), copia liviana (`display`) para la cartelera.

**B6. Pruebas.** Tests de la lógica de composición (zonas seguras, rotación, texto); capturas de referencia de cada plantilla en una foto de ejemplo; prueba en dispositivos reales.

**B7. Criterio de listo.** Cada plantilla se ve bien con una foto de una persona, de un grupo y de un paisaje; en vertical y horizontal; nunca tapa una cara; y la organizadora puede elegirla y verla en el panel antes de publicarla.

## Épica C. Vistas previas de lo que ve el invitado (para la organizadora)

Objetivo: que la organizadora vea, desde su panel y en formato teléfono, lo que verán sus invitados, **sin crear datos reales**.

- **C1. «Ver como invitado»**: un marco de teléfono (390×844) dentro del panel con estados elegibles: formulario de inscripción; inscrito con la **cámara bloqueada**; con la cámara **activa**; cartelera con los **avisos actuales**; cartelera con **fotos publicadas** (carrusel); cartelera vacía; cupo agotado.
- **C2. Vista previa al redactar un aviso**: cómo se verá el aviso nuevo (portada, subtítulo, cuerpo, galería) en la cartelera móvil, antes de publicarlo.
- **C3. Vista previa de marcos** con una foto de ejemplo, en vertical y horizontal, con el marco y los stickers del evento.
- **C4. Vista previa del estilo** al elegir un preset en Ajustes, antes de guardar. *Hecha (2026-10-24), ver [`vistas-previas.md`](./vistas-previas.md).*
- **C5. Vista previa de la tarjeta del enlace** (WhatsApp) con el título, el subtítulo, la descripción y la imagen del evento.
- **C6. Flujo del QR simulado**: qué ve un invitado al escanear el código (sin usar el código real).
- **Técnica propuesta:** componentes de presentación puros alimentados por datos (el evento real de la organizadora y datos de ejemplo), renderizados dentro del panel; sin llamadas a RPC de invitado ni tokens; sin exponer `activation_code`. Reutilizar `IdentifyForm`, `GuestHub`, `AnnouncementFeed`, `PhotoCarousel`, `CameraSection` en lugar de duplicarlos.
- **Criterio de listo:** la organizadora puede recorrer los estados C1–C6 desde el panel, en el celular y en el computador, y lo que ve coincide con lo que ve un invitado.

## Épica D. Panel de la organizadora pensado para el celular
La organizadora administra durante la fiesta, desde el teléfono.
- Navegación móvil de las pestañas; las acciones del día de la fiesta a un toque (revisar fotos, publicar lote, ver quién activó la cámara, cuántas fotos faltan por revisar). *Hecho: etapa 1 (pestaña «Hoy») y etapa 2 (insignia en «Fotos», ver [`panel-fotos-por-revisar.md`](./panel-fotos-por-revisar.md)).*
- Moderación rápida (swipe), con confirmaciones que no estorben.
- Estados de carga, vacío y error en cada pestaña.
- Revisar `GuestListPanel` (acciones en filas cortas) y `EnrollmentSettings` (formularios largos) en pantallas pequeñas.

## Épica E. Calidad transversal
Accesibilidad (foco visible, lectores de pantalla, `prefers-reduced-motion`), rendimiento (peso del bundle y de las fuentes), una lista de verificación de QA para antes de una fiesta, y los pendientes de `marcos-y-stickers.md`.

## Cómo aplicar las skills de diseño

| Skill | Dónde |
|---|---|
| `impeccable` (`critique`, `audit`, `adapt`, `harden`, `polish`) | Épicas A, C y D: auditoría móvil, adaptación a pantallas pequeñas, estados vacíos y de error, pulido. |
| `design-taste-frontend` | Épica B: diseñar las plantillas nuevas y las piezas expresivas del invitado (formulario, cartelera, carrusel). |
| `emil-design-eng` | Detalles de interacción: disparo de la cámara, cambio y rotación de marcos, carrusel, previews. |
| `animate`, `motion-*`, `animation-performance` | Transiciones de marcos y de la cartelera, respetando el movimiento reducido. |
| `frontend-a11y` | Todas las épicas: foco, contraste, objetivos táctiles. |
| `browser-qa`, `playwright-cli`, `break-ui` | Verificación móvil con capturas (WebKit iPhone, Chromium Pixel) y pruebas de estrés de la interfaz. |

El flujo del repositorio: `orch-add-feature` / `orch-change-feature` para cada pieza, TDD, y las revisiones de `code-reviewer`, `typescript-reviewer`, `security-reviewer` y `database-reviewer` antes de fusionar.

## Orden sugerido
1. **A (revisión móvil)** primero: es barata, da datos reales y puede mostrar que hay arreglos urgentes (por ejemplo el zoom de iOS).
2. **C1 y C2**: la organizadora necesita ver lo que ve el invitado y cómo quedará un aviso.
3. **B (marcos)**: diseñar el catálogo, validar con la organizadora y construirlo plantilla por plantilla.
4. **D y E** en paralelo con lo anterior.

## Preguntas abiertas para el dueño
- ¿Cuántos marcos por evento se esperan y los elige el invitado o rotan solos?
- ¿Qué se hace con los marcos que ya usa la clienta de la primera fiesta?
- ¿La vista previa de «ver como invitado» debe incluir la cámara real (con la cámara de la organizadora) o basta con una foto de ejemplo?
- ¿Se retira el editor de capas libre o se deja como opción avanzada?
