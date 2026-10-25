# Notas temporales: marcos por resolución, presets con imagen y cámara propia

> **Temporal.** Es el traspaso de una sesión a otra (2026-10-25). Cuando el trabajo esté hecho, lo que valga pasa a `marcos-y-stickers.md` y `pantalla-de-camara.md`, y este archivo se borra. No hay código de esto todavía: todo lo de abajo es **pendiente**, salvo la sección 1.
>
> Antes de asumir algo de aquí, confírmalo contra el código (`CLAUDE.md` lo exige). Marqué cada afirmación como **verificado** (lo medí o lo leí) o **sospecha / sin verificar**.

## 1. Qué ya está hecho y fusionado en `main`

| PR | Qué dejó |
|---|---|
| #42 | Estudio de diseño responsivo (3 columnas, lienzo que se ajusta), Konva solo para interactuar (cajas invisibles + `Transformer`; lo visible lo pinta `renderFrame`), presets de `halloween-neon` pulidos, **solo existe la plantilla `capas`**. La migración `20261026100018_frames_solo_capas.sql` **ya corrió en producción**: borró los marcos con plantilla antigua y dejó `template = 'capas'`. |
| #43 | Cámara: el visor y la foto tienen siempre la proporción del teléfono (3:4 vertical, 4:3 horizontal) y el video se **recorta** para llenarlos (`src/lib/cameraFraming.ts`: `coverCrop`); `useScrollLock` bloquea el scroll de la página de atrás. |
| #44 | Cada marco de imagen completa declara su proporción (`fullImageAspect`) y la cámara solo lo ofrece si calza con la foto (`frameFitsAspect`). |

| #46–#50 | **Zoom de la cámara resuelto (2026-10-25).** Se midió en un iPhone 11 (iOS 18.7, Safari 26.6) con un diagnóstico temporal ya retirado. Safari entrega el video **girado** si se piden `width`/`height`/`aspectRatio` (2048×1536 en vertical) y `getSettings()` no lo refleja; pedir solo `facingMode` llega derecho pero a 480×640 (la Fase 0). `src/lib/cameraStream.ts` (`openCameraStream`) pide lo ideal, **mide los cuadros reales** con el video reproduciéndose y, si vienen girados, reintenta con las medidas giradas y, al final, con la cámara sola. Resultado medido: 1536×2048 en vertical y 2048×1536 en horizontal, zoom aparente 1,00× en trasera y frontal. El efecto de la cámara depende de `orientation` y se reabre al girar. El «aviso de atrás» desapareció con el #45 (era el despliegue). |

Herramientas que quedaron: `scripts/qa-estudio/capturas.mjs` (Estudio, presets × 4 proporciones) y `scripts/qa-estudio/camara.mjs` (cámara: proporción del visor, zoom aparente, scroll de fondo, con un video simulado de la forma que elijas).

## 2. Lo que pide el usuario (cuatro frentes)

### A. Un marco, una versión por resolución
> «Si hago un marco debería poder editar la versión para 3:4, 4:3, 1:1, 9:16 por separado, no subir un marco para cada uno; independientes pero el mismo marco. El usuario puede elegir con qué resolución sacar la foto manualmente, excepto al ponerlo en horizontal: ahí es 4:3 o 1:1.»

Hoy: un marco = `params.layers` único; el Estudio ya tiene un conmutador de proporción (`aspectRatio` en `LayerEditor.tsx`), pero **solo cambia la vista previa**, no se guarda nada por proporción. Un marco de imagen se estira o se esconde (PR #44) según la proporción.

### B. Presets nuevos con las imágenes de IA
> «Reemplacemos los presets que hay ahora con estos con las imágenes, así no tengo que hacer tanto y puedo ver la versión final con los textos y demás.»

Los cuatro diseños (A Esquinas, B Boleto, C Cumpleaños, D Burn Book) × cuatro proporciones = 16 PNG ya procesados.

### C. Evaluar las fuentes
> «Igual las fuentes actuales no sé si me gustan mucho, le haría una evaluación.»

### D. La cámara como pantalla propia
> «La cámara debería ser su propio sector en la app, no un modal o algo sobre otro elemento, así puede tener total libertad y mejor funcionamiento sin heredar nada. Pantalla completa sola para la cámara. En la fase 0 funcionaba mejor incluso en este aspecto: sacar fotos sin ningún problema de resolución o zoom.»

Dos quejas concretas al probar en un teléfono real tras #43: **parece tener zoom** y **aún ve el componente de aviso de atrás**.

## 3. Hallazgos (separando lo medido de lo supuesto)

### El zoom: RESUELTO en el #50 (ver la tabla de la sección 1). Lo de abajo es el análisis previo, útil como historia.

### El zoom: la sospecha del usuario es correcta en el mecanismo (verificado)
El arreglo del PR #43 **no corrige la resolución: recorta el video** (`coverCrop` al disparar y `object-cover` en el visor). Si el video que entrega el teléfono no es 3:4, el visor muestra solo una parte. Medido con `camara.mjs` en una ventana de 390×844 (el visor siempre queda 390×520):

| Video que entrega el navegador | Zoom aparente (cuánto se pierde) |
|---|---|
| 3:4 (480×640) | 1,00 (nada) |
| 9:16 (1080×1920) | **1,33×** (se ve el 75 % del alto) |
| 4:3 apaisado en vertical (640×480) | **1,78×** (se ve el 56 % del ancho) |
| 16:9 (1280×720) | **2,37×** |

**Sin verificar:** qué video entrega el teléfono del usuario. El video del script es simulado. Lo primero es **medirlo en un teléfono real** (ver sección 6, paso 1).

En la Fase 0 la rama heredada de `CameraCapture` (sin marcos ni stickers) **no recorta al disparar**: dibuja el cuadro entero del video en el canvas. Ese es el comportamiento que el usuario recuerda como «sin zoom». Cuidado: el visor de esa rama también usa `object-cover`, así que lo que se ve ahí tampoco era exactamente la foto; lo que no pasaba es recortar la foto final.

### «Aún veo el aviso de atrás»: no reproducido (verificado en simulación, sin verificar en teléfono)
En Chromium con teléfono virtual, con el PR #43: la capa de la cámara cubre la ventana entera (0,0 → 390×844), ningún ancestro rompe el `position: fixed` (sin `transform`, `filter` ni `contain`), y rueda y deslizamiento táctil dejan la página en `scrollY = 0`; sin el bloqueo, la misma prueba la mueve 600 px.

Hipótesis, **ninguna comprobada**: (1) el usuario probó antes de que terminara el despliegue; (2) en un teléfono real la barra del navegador, `inset-safe` o el modo de pantalla completa de iOS dejan ver lo de atrás; (3) «aviso» es otro componente (por ejemplo el sello `ConfirmationBanner` o `previewNotice`) y no la cartelera. **Pedir captura de pantalla y modelo de teléfono/navegador** antes de seguir adivinando. La salida de fondo es la del frente D: si la cámara es su propia ruta, no hay nada «detrás».

### Los PNG de IA no caben en un pack público (verificado)
WebP calidad 70, con transparencia, a los tamaños actuales:

| Formato | Tamaño | Peso por imagen |
|---|---|---|
| 3:4 | 1086×1448 | 178–218 KB |
| 4:3 | 1600×1195 | 219–302 KB |
| 9:16 | 893×1600 | 184–239 KB |
| 1:1 | 1600×1600 | 237–381 KB |

Total de los 16: **≈ 4 MB**. El validador de packs (`scripts/packs/validate-packs.mjs`) exige **≤ 120 KB por raster y ≤ 2 MB por pack**. O se bajan resolución y calidad (probable pérdida de nitidez del neón), o se suben los límites, o los presets con imagen viven en Storage del evento en vez de en `public/packs` (el flujo de «+ Imagen» del Estudio ya sube ahí y recomprime a ≤ 1600 px y ≤ 1 MB). Es una **decisión abierta**.

## 4. Diseño propuesto (a validar con el usuario antes de construir)

### A. Marco con una variante por proporción
- **Datos.** Opción recomendada: `params.variants = { '3:4': { layers: [...] }, '4:3': {...}, '1:1': {...}, '9:16': {...} }`, con `params.layers` actual como compatibilidad (o variante por defecto). Alternativa: etiquetar cada capa con `ratio`. Se prefiere `variants` porque cada proporción se edita y valida sola.
- **Tocar:** `src/lib/cameraAssets/frames.ts` (`validateFrameParams`, `sanitizeFrameParams`, `KNOWN_KEYS`), `layers.ts`, **migración nueva** que actualice `valid_frame_params` / `valid_frame_layers` (ver `20261018100011_frame_layers.sql`, `20261024100014_frame_layers_anclaje.sql`, `20261026100017_frame_layer_asset.sql`), tests de paridad SQL/TS (`supabase/tests/frame-layers.test.ts`, `camera-assets.test.ts`), la lista de versiones en `supabase/tests/prune.test.ts`, y `npm run build:setup-sql`. Tope actual: 40 capas y 16 KB de `params`; con 4 variantes hay que decidir si el tope es por variante o total.
- **Editor.** El conmutador de proporción de `LayerEditor.tsx` pasa a ser el selector de variante: cada proporción tiene sus capas. Faltan decisiones: ¿se puede **copiar/adaptar** una variante desde otra (las capas ancladas ya migran solas entre proporciones)? ¿Qué pasa con una variante vacía?
- **Cámara.** Un solo carrusel de marcos; cada marco usa la variante de la proporción elegida. El invitado **elige la proporción de la foto a mano**: en vertical 3:4 (por defecto), 1:1 o 9:16; en horizontal **solo 4:3 o 1:1**. Decidir qué hace un marco sin variante para esa proporción: ocultarlo, o usar las capas ancladas del marco base. El filtro `frameFitsAspect` del PR #44 se reemplaza por esta búsqueda de variante.
- **Captura sin zoom.** Pedir al navegador la proporción elegida (`getUserMedia` con `aspectRatio`/`width`/`height`), y recortar **solo** si el dispositivo no la entrega, mostrando en el visor exactamente lo que se va a grabar. Mantener visible la proporción real. No volver a recortar en silencio.

### B. Presets nuevos
- Reemplazan los cuatro de `public/packs/halloween-neon/pack.json` (que hoy componen piezas SVG). Cada preset trae sus variantes (frente A) y **capas de texto** de ejemplo para ver el resultado final (título bajo la línea en B y C, etc.).
- Depende del frente A (un preset sin variantes por proporción no sirve) y de la decisión de peso de la sección 3.
- Ojo con la privacidad: las imágenes son del evento de Francisca. Un pack público las expondría a todos los tenants; usar pack `private` con `eventSlug` o Storage del evento.

### C. Evaluación de fuentes
- **Hoy** (`src/lib/cameraAssets/text.ts`): del sistema `sans`, `serif`, `mono`, `display` (Impact), `hand`, `typewriter`; web (autoalojadas con `@fontsource`) `anton`, `playfair`, `pacifico`, `marker` (Permanent Marker), `elite` (Special Elite). Las de sistema se ven distinto en iOS, Android y Windows.
- **Entregable:** una hoja que dibuje el mismo título y subtítulo («PUTI HALLOWEEN», «30 OCT · CUMPLEAÑOS FRAN») en cada fuente con el estilo neón (trazo y brillo), a tamaños de foto de teléfono, más una propuesta de 3 a 5 fuentes para un catálogo corto y coherente. Criterio: legibilidad a 3:4 en un teléfono, peso de descarga, licencia (OFL) y que exista en `@fontsource`. Cualquier fuente nueva exige actualizar `WEB_FONTS`, `FONT_LABELS`, `FONT_STACKS`, `WEB_FONT_FACES`, la validación SQL de capas de texto (lista de fuentes) y sus tests.

### D. Cámara como ruta propia
- Hoy se monta como capa `fixed inset-safe z-50` **dentro** de la página: `GuestHub.tsx` (Fase 1, `/e/:slug`), `GuestPage.tsx` (Fase 0, `/i/:token`) y `GuestPreviewPage.tsx` (vista previa del organizador, iframe). Hereda el documento de atrás.
- Propuesta: ruta propia (por ejemplo `/e/:slug/camara`; `EventEntryPage` ya tiene subrutas con `/*`, p. ej. `/a/:code`), pantalla completa con su propio contenedor (`h-dvh`, `overflow-hidden`, `overscroll-behavior: none`), que carga cupo, marcos y stickers por su cuenta y vuelve con `navigate(-1)`. `useScrollLock` queda sin función en esa ruta.
- Incluye decidir qué pasa con la vista previa del organizador y con la ruta heredada de la Fase 0, y qué hace el botón «Atrás» del teléfono.
- Tests que se verán afectados: `CameraCapture.test.tsx`, `.composer`, `.layout`, `.ritual`, `GuestHub*.test.tsx`, `GuestPreviewPage.test.tsx`.

## 5. Dónde está cada cosa

**Código (versionado):** `src/components/CameraCapture.tsx` (el compositor y `handleShoot`), `src/components/camera/ComposerStage.tsx`, `src/lib/cameraFraming.ts`, `src/hooks/useCameraAssets.ts`, `src/hooks/useScrollLock.ts`, `src/hooks/useOrientation.ts`, `src/components/studio/LayerEditor.tsx` (conmutador de proporción), `KonvaCanvasStage.tsx`, `FramePreview.tsx`, `src/lib/cameraAssets/{frames,layers,packs,konvaParity,text}.ts`, `public/packs/halloween-neon/`.

**Datos del cliente (privados, NO versionados; `docs/clientes/` está en `.gitignore`: nunca `git add -f`)** en `docs/clientes/francisca/`:
- `marcos/ia/`: 16 PNG con transparencia (`A-esquinas`, `B-boleto`, `C-cumple`, `D-burnbook` × `3x4`, `4x3`, `9x16`, `1x1`) y los originales `-bruto` (los 3:4 son de ChatGPT, el resto de Gemini). Los 3:4 de ChatGPT miden 1086×1448; los de Gemini, 1600 px de lado largo. Gemini no entrega exactamente 4:3 ni 9:16 (1,339 y 0,558).
- `marcos/prompts-gemini.md` (12 prompts listos), `marcos/prompts-ia.md` (receta general), `marcos/quitar-fondo-negro.py` (convierte fondo negro en transparencia; `--umbral`, `--lado`).
- `llms-raw/marcos completos/`: los 4 originales de ChatGPT.
- `marcos/cargar-marcos-v3.sql` inserta un `viewfinder` (línea 26): **falla** desde la migración `20261026100018`. Si se vuelve a usar, quitar esa fila.

**Reglas del producto que no se pueden romper:** `src/styles/legibilidad.test.ts` (ningún texto menor a `text-xs`), paridad Konva ↔ `renderFrame`, `KonvaCanvasStage` solo por `React.lazy` (0 bytes de Konva para el invitado), `node scripts/packs/validate-packs.mjs`, ninguna columna con RUT/correo/teléfono/PIN en claro.

## 6. Orden sugerido

1. ~~**Medir en el teléfono real**~~ (hecho, #46–#50) antes de decidir nada de la cámara: agregar un modo de diagnóstico temporal (por ejemplo `?diagnostico=1`) que muestre `track.getSettings()` (ancho, alto, `aspectRatio`, `zoom`), `video.videoWidth/Height`, el tamaño del visor y `window.innerWidth/Height` / `visualViewport`. Con eso se sabe si el zoom viene del recorte y cuánto. Pedir también una captura de lo que ve «atrás».
2. **Frente D** (cámara como ruta propia): elimina de raíz el problema de «heredar», y es previo a tocar la captura.
3. **Captura sin zoom**: la apertura ya está resuelta (#50). Falta el selector manual de proporción (vertical: 3:4, 1:1, 9:16; horizontal: 4:3 o 1:1) y que el recorte, si lo hay, se vea en el visor.
4. **Frente A, datos y editor** (migración, validación espejo, Estudio con variantes).
5. **Frente B**, con la decisión de peso resuelta, y **frente C** (se puede hacer en paralelo en cualquier momento).

## 7. Verificación y entorno

- `npm run typecheck`, `npm test` (≈ 1500 tests; `CameraStudio > edita un marco existente` falló una vez bajo carga y pasa en aislamiento: carrera de tiempos), `npm run build`, `node scripts/packs/validate-packs.mjs`.
- **No hay Docker** en este equipo. Para `test:db`, levantar un Postgres 16 efímero: `initdb` y `pg_ctl` de `/usr/lib/postgresql/16/bin`, puerto 55433, usuario `postgres`, clave `test`, y correr con `FCUMPLE_TEST_PG_EXTERNAL=1`. Apagarlo al terminar.
- Escritorio: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=clave-falsa npx vite --host 127.0.0.1 --port 5173` y luego `scripts/qa-estudio/capturas.mjs` o `camara.mjs` (necesitan `playwright-cli` global).
- Para apagar Vite no uses `pkill -f` con el patrón en el mismo comando (se mata a sí mismo): busca el PID con `ss -ltnp | grep :5173`.
- Un hook de este entorno (GateGuard) pide enunciar hechos antes del primer cambio en cada archivo y de crear archivos; los comandos con `python3` que escriben archivos se tratan como destructivos.
- Las migraciones se aplican solas al fusionar a `main` (Deploy); un cambio de esquema necesita su migración, su test de base de datos y `npm run build:setup-sql`.
- Empujar y abrir PR es automático; **avisar antes de fusionar**.

## 8. Preguntas abiertas para el usuario

1. Marco sin variante para la proporción elegida: ¿se oculta, o se usan las capas ancladas del marco base?
2. ¿Qué proporciones ofrece la cámara en vertical (3:4, 1:1, 9:16) y la regla de horizontal (4:3 o 1:1) son definitivas?
3. Peso de los presets con imagen: ¿bajar calidad, subir límites del validador, o Storage del evento (privado)?
4. ¿Los presets nuevos son públicos para todos los tenants o solo del evento de Francisca?
5. Cámara como ruta: ¿qué pasa con la ruta de la Fase 0 (`/i/:token`) y con la vista previa del organizador?
6. ¿Qué teléfono y navegador usa para probar? ¿Ve el aviso de atrás en el visor o en los costados?
