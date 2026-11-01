# Plan: del editor de capas a un «estudio de diseño» con recursos y presets

Fecha: 2026-10-24. **Propuesta, nada está decidido ni construido.** Origen: pedido del dueño tras ver los marcos del evento piloto («repensar completamente los marcos»; «marco» es una decoración de la foto en general, no un borde negro literal; pasar a algo parecido a Canva, con presets completos y paquetes de recursos). La fiesta del evento piloto es el 2026-10-30.

Cómo leerlo: cada afirmación dice si está **verificada** (código o fuente leída hoy), si es **estimación** o si es **propuesta**.

## 1. Objetivos

1. Un sistema de diseño de fotos parecido a Canva: biblioteca de recursos que se colocan en el diseño.
2. **Presets** completos, diseñados para un evento concreto (el piloto primero).
3. **Paquetes de recursos** por evento o por estilo.
4. Un camino de calidad para conseguir esos recursos (generarlos o importarlos).
5. **Editar solo desde un computador**; en el celular, solo ver.
6. Limpiar el diseño de la pantalla de cámara del invitado.

## 2. Reencuadre

Hoy el producto habla de «marcos». Un marco es solo un tipo de decoración. El sistema nuevo habla de **diseños de foto**: una composición de piezas (texto, ilustraciones, cintas, sellos, destellos, un borde si se quiere) sobre la foto, siempre con el centro libre (regla del backlog: la interfaz y la decoración nunca tapan las caras). Un preset puede ser un cartel arriba, piezas sueltas en las esquinas, un ticket, un borde, o una mezcla.

## 3. Qué hay hoy (verificado en el código)

- **Motor:** `renderFrame` (Canvas 2D) dibuja igual la vista previa y la foto final. Plantilla `capas`: lista de capas (`text`, `shape` con `rect`/`ellipse`/`line`/`path`, `image`, `emoji`), hasta 40, texto de 60 caracteres, trazos `path` de hasta 600 caracteres con solo `M L C Z`, tipografías de una lista cerrada. Desde el PR #26 una capa se ancla a bordes y esquinas (`dx`, `dy`, `box`), así que el diseño funciona en vertical, horizontal y 9:16.
- **Imágenes en capas:** solo desde Storage del evento (`{event_id}/frames/…`), hasta 1600 px y 1 MB, con URL firmada. Cada descarga cuenta como salida de datos de Supabase (límite del plan gratuito: 5 GB).
- **Editor:** `LayerEditor` (lienzo vertical de 270×360, lista de capas, propiedades por tipo). No tiene biblioteca, presets, deshacer/rehacer, guías de alineación ni selector de proporción, ni versión pensada para el celular.
- **Datos:** `event_frames.params` (jsonb validado en TypeScript y en SQL con tests de paridad).

## 4. Por qué el sistema de formas no alcanza (hipótesis a validar con el dueño)

Los dibujos salen de trazos escritos a mano en una caja de 100×100 con cuatro comandos. Eso produce un estilo de «clip-art plano»: sin arcos, sin degradados, sin grosor de trazo variable, sin texturas; y cada ajuste de diseño obliga a tocar código y regenerar. La calidad depende de quien escriba los números, no de quien diseñe. **Conclusión:** el diseño no debe vivir en código; debe vivir en **recursos** (ilustraciones hechas con herramientas de diseño) y los presets solo los **componen**.

## 5. Arquitectura propuesta

### 5.1 Tres conceptos
- **Recurso:** un archivo (SVG o WebP con transparencia) más sus metadatos: id, nombre, categoría, etiquetas, **licencia y fuente**, si es recoloreable y qué colores expone.
- **Paquete:** una carpeta con un `pack.json` (manifiesto) y sus recursos, versionada. Ej.: «Neón de fiesta». Cada recurso del paquete lleva su licencia anotada.
- **Preset:** un diseño completo (lista de capas) que referencia recursos de un paquete, con **colores como roles** (`$acento`, `$fondo`, `$texto`) en vez de valores fijos y con textos editables. Aplicar un preset **copia** sus capas a un diseño del evento, que el organizador puede seguir editando.

### 5.2 Capa `asset` (propuesta)
Una capa nueva que referencia un recurso por nombre (`pack:neon-fiesta/murcielago`) en vez de una ruta de Storage. Los paquetes se sirven como archivos estáticos del propio sitio (`/packs/…`): **mismo origen** (sin CORS ni URL firmada), con caché de la CDN y **sin gastar la salida de datos de Supabase**. Exige una migración (la validación SQL hoy solo acepta rutas de Storage del evento) y su test de paridad.

### 5.3 Recoloreo
El SVG expone colores con nombre; antes de dibujar, el motor sustituye los colores del recurso por los del preset y lo carga como imagen. Así el organizador cambia el color de una pieza o de todo el preset. Los recursos raster (WebP) solo se recolorean si son de una sola tinta (silueta). **Riesgo sin verificar:** en Safari, un SVG cargado desde un blob puede «contaminar» el canvas y romper la exportación de la foto (fuente: notas de Chrome y WebKit leídas hoy, sin confirmar en un iPhone real). Mitigaciones: usar un `data:` URI y no un blob, o rasterizar el SVG al cargarlo; probar en iPhone real antes de comprometer.

### 5.4 Texto
Ya existe color, contorno, sombra, tipografía y tamaño. Se suma una lista de **estilos de texto** del paquete (título, subtítulo, sello) y se ofrece cambiar el color por roles.

### 5.5 El «Estudio» (editor, solo escritorio)
Tres paneles: **biblioteca** a la izquierda (Presets, Elementos, Texto, Subidas, con búsqueda y categorías), **lienzo** al centro (selector de proporción 3:4 / 4:3 / 9:16, zoom, guías), **propiedades** a la derecha, más la lista de capas. Funciones mínimas: arrastrar desde la biblioteca, mover/escalar/girar, **deshacer y rehacer**, duplicar, voltear, bloquear capa, alinear con guías e imán, atajos de teclado, cambiar colores del preset por roles.

### 5.6 ¿Motor propio o una librería?
- **Mantener el motor propio** (propuesta): la misma función dibuja la vista previa y la foto, lo que garantiza que lo que se ve es lo que recibe el invitado. Un motor aparte para editar duplicaría el dibujo y arriesga desalinear.
- Librerías de edición: **Konva y Fabric.js** son gratuitas con licencia MIT; **Polotno** (editor ya hecho, basado en Konva) es de pago, unos $899 al mes en su plan de autoservicio. Estos datos salen de las páginas de comparación de la propia Polotno y no se verificaron en las oficiales; confirmar antes de decidir. Si el costo de las transformaciones y guías resulta alto, evaluar Konva solo para la edición, con una prueba de paridad contra `renderFrame`.

## 6. De dónde salen los recursos (investigación)

| Ruta | Calidad y coherencia | Costo | Licencia y riesgo |
|---|---|---|---|
| **Bibliotecas abiertas** (Iconify y sus conjuntos; Noto, Fluent, OpenMoji, Lucide, Phosphor) | Buena y uniforme dentro de cada conjunto; sirve para iconos simples (corazón, estrella, murciélago), no para ilustraciones de fiesta con personalidad. SVG recoloreable. | Bajo | **Cada conjunto trae su licencia** (MIT, Apache, CC BY, CC BY-SA, algunas «sin derivados»): anotarla por recurso y mantener una página de créditos. CC BY-SA obliga a compartir igual. |
| **Generar con IA** (por ejemplo `gpt-image-1` con `background="transparent"` y PNG, o modelos tipo FLUX) más un removedor de fondo (**BiRefNet**, pesos MIT) | La que más se acerca al estilo de la invitación del evento (línea neón sobre negro). La coherencia entre piezas exige prompt de referencia estable. Salida raster (WebP con alfa). | Medio (tokens y curaduría) | **No encontré los términos de uso comercial de las imágenes generadas: leerlos directo antes de usarlas en un producto.** Los reportes sobre transparencia en modelos nuevos se contradicen: verificar en la documentación vigente. |
| **Vectorizar** (vtracer o potrace) piezas de **una sola tinta** generadas con IA | SVG liviano, nítido a cualquier tamaño y **recoloreable**. Funciona justo para el estilo contorno de una tinta. Pierde detalle en piezas complejas. | Medio | Hereda la licencia de la pieza original. No verifiqué la licencia de vtracer ni de potrace: revisar. |
| **Dibujar a mano** (Figma, Inkscape, Illustrator) | Máxima calidad y control. | Alto en tiempo | Sin riesgo de licencia. |
| **Canva** | Muy buena, pero **su licencia permite usar sus elementos dentro de un diseño y prohíbe distribuirlos como recurso independiente** (ni vender «stock»). | Bajo | Sirve para **un diseño único** de un evento puntual, **no para armar paquetes reutilizables** de la plataforma. |
| **Comprar paquetes** (mercados de recursos) | Variable. | Medio | Casi todos prohíben redistribuir los archivos editables en un producto: exigir licencia extendida y leerla. |

**Recomendación para el evento piloto:** la ruta de una tinta (generar line-art con IA, vectorizar, curar) combinada con una biblioteca abierta para los iconos simples. Es la que mejor calza con el estilo de la invitación y entrega SVG recoloreable. Antes de comprometer, hacer una **prueba de un día**: 10 piezas, comparar calidad y peso contra los trazos actuales y decidir si seguir.

**Tubería propuesta** (`scripts/packs/`): optimizar (svgo para SVG, WebP con calidad fija), validar el manifiesto (licencia obligatoria, peso máximo por recurso y por paquete, colores declarados) y un test que falle si falta algo. Presupuesto sugerido (estimación): SVG ≤ 60 KB, WebP ≤ 120 KB, paquete ≤ 2 MB.

## 7. Presets del evento piloto (conceptos)

No son marcos con borde negro: son **composiciones**. Para cada uno de los dos temas del evento (cumpleaños y Halloween) tres variantes:

- **Cartel:** título grande en una cinta o sello, con piezas en las esquinas.
- **Esquinas:** sin borde; solo piezas sueltas (destellos, globos, telaraña, murciélagos) en las cuatro esquinas.
- **Ticket:** el lenguaje de la invitación (talón con muescas y línea de corte), más liviano que el actual.

Cada preset trae sus textos editables y una **paleta de tres roles** (acento, fondo, texto) cambiable de un clic. Seis presets en total, con los colores de la invitación por defecto. Los textos exactos y las fechas se confirman con la persona del evento.

## 8. Edición solo en computador

- El **Estudio** solo se monta cuando el dispositivo es de puntero fino y la ventana mide al menos 1024 px (`matchMedia('(pointer: fine) and (min-width: 1024px)')`).
- En el celular, la pestaña «Cámara» muestra los diseños y su vista previa **en solo lectura** y un aviso: «Para editar los diseños, entra desde un computador».
- Hoy el editor ya es incómodo en el celular (lienzo de 270×360 y asas pequeñas); esta regla lo formaliza. El invitado nunca edita.
- Con test: en pantalla táctil angosta no se monta el editor y sí la vista de solo lectura.

## 9. Pantalla de cámara del invitado

Crítica de la skill `impeccable` (evaluación de diseño más detector y mediciones en navegador): **21/40**. Lo más importante, validado contra el código:

- **P1, el visor ocupa 35 a 42 % del alto** (medido a 360×640, 390×844 y 430×932); cabecera, contador, bandeja de stickers y flechas compiten con la foto. Meta: visor ≥ 60 %.
- **P1, alcance del pulgar:** «Cerrar» y «Cambiar cámara» están arriba (y=12); las flechas de marco son pequeñas y tenues; deslizar para cambiar de marco choca con arrastrar stickers.
- **P1, foto perdida si falla la subida:** `handleSend` borra la foto al enviarla y, si la subida falla (red compartida de una fiesta), hay que rehacerla. El cupo **no** se gasta en un fallo (solo sube tras una subida exitosa), pero la foto se pierde. Además «Enviar» no avisa que descuenta un disparo ni cuántos quedan.
- **P2, disparo y revisión planos:** sin gesto propio del rollo (el dígito baja recién al enviar), sin cierre tras enviar y «Se acabó el rollo» es un callejón sin salida.
- **P2, cuatro rosas compiten** (título, dígito, obturador, marco): la Regla de Una Voz del sistema de diseño no se cumple.
- **Código muerto:** `FramingGuide` y `FrameOverlay` solo corren en la ruta antigua (sin marcos ni stickers); en la Fase 1 no se usan.
- Sin problemas mecánicos: sin desbordes, sin botones menores de 44 px, sin texto menor de 12 px, contraste entre 6,4:1 y 14,7:1.

Lo mejor de la pantalla es el contador de rollo (`FilmRollCounter`); el boleto del evento, la otra pieza de identidad del sistema, no aparece en la cámara.

## 10. Fases (estimaciones, sin comprometer)

**Fase 0, antes del 30-oct (unos 5 días).** Solo lo que protege la fiesta:
1. Pantalla de cámara: los tres P1 (visor grande, controles al alcance del pulgar, foto conservada con «Reintentar» y aviso «te quedarán N»). Tests y revisión en teléfono real.
2. Edición solo en escritorio (sección 8).
3. Prueba de un día de recursos (sección 6) y decisión de si hay presets nuevos para el 30. **Si la prueba no convence o no alcanza el tiempo, el evento usa los marcos actuales, que ya funcionan.** Congelar cambios en producción 24 a 48 horas antes de la fiesta.

**Fase 1, base (después de la fiesta, 1 a 2 semanas):** capa `asset`, paquetes estáticos, migración con su test, recoloreo, validación del manifiesto, y los seis presets del evento piloto.

**Fase 2, el Estudio (2 a 3 semanas):** biblioteca con búsqueda, deshacer/rehacer, guías, selector de proporción, colores por roles, galería de presets.

**Fase 3:** más paquetes por estilo, una herramienta para cargar paquetes, y revisar la política de licencias.

## 11. Riesgos y lo que no está verificado

- **Licencias:** de las imágenes generadas con IA y de cada conjunto abierto. Es el mayor riesgo legal del plan.
- **Safari y SVG en el canvas:** sin probar en un iPhone real.
- **Coherencia de estilo** al generar piezas sueltas con IA: se resuelve con curaduría, no se garantiza.
- **Peso y red compartida:** los paquetes se sirven desde el CDN del sitio; límite de transferencia del plan de Vercel (unos 100 GB al mes según blogs, uso no comercial según los mismos): confirmar en la documentación de Vercel.
- **Nada probado en un teléfono real.** Todo lo de este plan se evaluó en navegador de escritorio simulado.

## 12. Decisiones que necesito del dueño

1. ¿Qué entra antes del 30: solo la limpieza de la cámara (Fase 0 mínima), o también presets nuevos si la prueba de recursos convence?
2. ¿Ruta de recursos para el piloto: IA más vectorizar (propuesta), solo bibliotecas abiertas, o diseñarlos tú en Figma o Canva solo para este evento?
3. ¿El Estudio puede esperar a después de la fiesta? (Propuesta: sí.)
4. ¿Motor propio con mejoras (propuesta) o evaluar Konva?

---

## 13. Respuestas del dueño y hoja de ruta cerrada (25-oct-2026)

### 13.1 Decisiones tomadas por sección

- **Lienzo y proporciones:** el lienzo base es **3:4 (4:3 vertical)** y debe migrarse automáticamente entre proporciones (vertical 3:4, horizontal 4:3, historia 9:16 y cuadrado 1:1) mediante el sistema de anclajes a esquinas/bordes (`dx`, `dy`, `box`, implementado en PR #26).
- **Nivel de personalización del invitado:** el organizador define la composición fija en el marco; el invitado **a lo sumo puede insertar emojis** (no mueve las piezas del diseño del marco).
- **Presets y lienzo libre:** se ofrecen **ambas opciones** (plantillas prediseñadas completas listas de un clic para no diseñar desde cero, más libertad de editar en lienzo).
- **Edición solo en computador (`≥ 1024px`):** confirmada e implementada en PR #27 (`matchMedia('(pointer: fine) and (min-width: 1024px)')`); en el celular el organizador tiene vista de solo lectura.
- **Generación de recursos con IA propia (desbloqueo del NO-GO de OpenRouter/Recraft):**
  - El bloqueo legal documentado en `prueba-recursos-ia.md` provenía de usar **OpenRouter** como intermediario (ni OpenAI §4.1 ni Recraft §1.4/§6.2 garantizan el sub-traspaso escrito de titularidad a través de revendedores, y Recraft §3.5 impone cláusulas hacia terceros).
  - Se utilizan las **suscripciones directas del dueño (ChatGPT y Gemini)**, donde la relación contractual es directa (OpenAI *Terms of Use* §3.a cede el 100% de la titularidad sobre el *Output*), combinadas con vectorización local (`vtracer` + `svgo`, ambos MIT) o exportación WebP/PNG transparente e **importación directa por SQL** (sin necesidad de construir una API de subida para antes de la fiesta).
- **Cámara del invitado para el 30-oct:**
  - Visor agrandado al 62–74% del alto en vertical y botones abajo al alcance del pulgar: **implementado en PR #28 y PR #30**.
  - Conservar la foto en memoria si falla la red y botón «Reintentar» idempotente sin gastar doble disparo: **implementado en PR #28, PR #29 y PR #31**.
- **Marcos para [primera clienta]:** se generan **marcos nuevos de mayor calidad (v3)** antes del congelamiento del 28-oct aplicando el enfoque de composiciones temáticas y piezas ricas.
- **Aislamiento de paquetes y presets (post-fiesta):** modelo híbrido. Los **presets base** (ej. Halloween) son **públicos** para cualquier cumpleañero; los paquetes o composiciones a medida de un evento (como el de [primera clienta]) son **privados** de ese evento. Monetización queda fuera de alcance por ahora.

### 13.2 Hoja de ruta estricta: Corte 28-oct vs. Fase 2 Post-Fiesta

#### Corte 1: Antes del Congelamiento (25-oct al 28-oct 23:59)
1. **Sincronización de ramas (25-oct):** `main` local actualizada hasta PR #39 (`9c32b2c`, incluyendo cámara PR 1/2, `submit_photo` idempotente, resolución 4:3 `2048×1536` y vista previa de cámara en panel).
2. **Marcos v3 para [primera clienta] (dos marcos) (25–26 oct):**
   - Reemplazar las formas geométricas simples de `generar-marcos-v2.py` por composiciones de mayor riqueza visual (ilustraciones curadas con ChatGPT/Gemini y trazos ricos, sin «borde negro pesado» que achique la foto), dejando solo emojis en `event_stickers`.
   - Validar en el banco de pruebas (`preview.html` + `shoot.mjs`) en 3:4, 4:3 y 9:16 y en `/panel/e/:id/vista-previa`.
3. **Prueba en teléfono real y carga en producción (27–28 oct):**
   - Ejecutar `guion-prueba-telefono.md` en iOS Safari y Android Chrome (incluyendo prueba de corte de red + botón «Reintentar»).
   - Cargar el SQL definitivo en Supabase de producción y congelar cambios la noche del **28-oct-2026**.

#### Corte 2: Fase 2 Post-Fiesta (Desde el 31-oct)
1. **Etapa 2.1 — Capa `asset`, paquetes estáticos/privados y roles de color:**
   - Migración SQL + TS para `type: 'asset'`, paquetes públicos en `/public/packs/<pack-id>/pack.json` servidos por CDN (0 egress de Supabase) y soporte de packs privados por `event_id`.
   - Roles de color (`$acento`, `$fondo`, `$texto`) y recoloreo de SVG mediante `data:image/svg+xml;utf8,...`.
   - Conmutador de proporción en el lienzo (3:4 base ↔ 9:16 ↔ 1:1 ↔ 4:3).
2. **Etapa 2.2 — Estudio de Diseño en escritorio con `react-konva`:**
   - Integrar `react-konva` cargado con `React.lazy()` exclusivamente en `LayerEditor` (escritorio `≥ 1024px`), manteniendo `renderFrame` (Canvas 2D nativo, 0 KB extra para el invitado) en la cámara y un test de paridad `Konva <-> renderFrame`.
   - Manipulación con `<Transformer />`, guías magnéticas de alineación, historial Deshacer/Rehacer y biblioteca lateral de 3 paneles (Presets, Elementos, Texto).
3. **Etapa 2.3 — Poda de código heredado (D10):**
   - Eliminar los módulos `@deprecated` de la Fase 0 (`/i/:token`, `/admin`, `uploadPhoto`).

