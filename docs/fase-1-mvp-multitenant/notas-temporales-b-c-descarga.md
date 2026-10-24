# Notas temporales: marcos (épica B), vistas previas (épica C), publicación y descarga de fotos

Fecha: 2026-10-24. **Documento temporal**: junta lo que se habló para no perderlo. Cuando cada punto se decida o se construya, pasa a su doc (`marcos-y-stickers.md`, `vistas-previas.md`, `estado-del-producto.md`) y esto se borra. La fiesta es el 2026-10-30.

Cómo leerlo: cada afirmación dice si está **verificada** (contra el código o una fuente oficial), si es **estimación** (cuenta hecha con supuestos, sin medir) o si es **propuesta** (idea sin decidir). Nada de lo de aquí está probado en un teléfono real.

## 1. Moderación por lotes horarios: se descarta

**Decisión del dueño (2026-10-24):** no importa moderar por bloques horarios. Lo que sí importa es que se revise y se suba todo, ordenado por hora.

Verificado contra el código:
- `publish_photo_batch` (migración `20261024100013_cartelera_activacion_tema.sql`) publica **todas** las fotos aprobadas que aún no tenían `published_at`, y se puede repetir durante la fiesta. No hay bloques ni horarios.
- La cartelera del invitado sale ordenada por `created_at` (`order by p.created_at`, misma migración, línea 313), es decir, de la más antigua a la más nueva.
- La cola de revisión también va de la más antigua a la más nueva (`sortPhotosForTriage`, `src/lib/photoModerationQueue.ts`).

Así que lo que se pidió **ya es el comportamiento actual**. Lo único que sobra es `moderacion-por-lotes.md`, que describe encabezados por bloque, «Aprobar todo el bloque» y la zona horaria del evento, nada de lo cual existe. Queda marcado como descartado en ese documento.

## 2. Descarga de fotos de más calidad

### Qué hay hoy (verificado)
| Pieza | Valor | Dónde |
|---|---|---|
| Original (con marco y stickers ya compuestos) | máximo 1600 px del lado largo, JPEG calidad 0,8 | `CameraCapture.tsx` (`MAX_DIMENSION`, `JPEG_QUALITY`) |
| Copia de visualización | máximo 640 px, JPEG calidad 0,7 | `DISPLAY_MAX_DIMENSION`, `DISPLAY_JPEG_QUALITY` |
| Cartelera y carrusel | muestran la copia de visualización (`displayStoragePath ?? storagePath`) | `PhotoCarousel.tsx:85` |
| Botón «Descargar» | descarga el **original**, no la copia (`getSignedPhotoDownloadUrl(current.storagePath)`) | `PhotoLightbox.tsx:172` |

O sea: **la descarga ya es de mejor calidad que lo que se ve**. Lo que se pide es subir ese techo.

### Hallazgo que cambia el plan (verificado en el código, no en un teléfono)
La cámara se abre con `getUserMedia({ video: { facingMode } })`, **sin pedir resolución**. Los navegadores suelen entregar entonces una resolución modesta (a menudo 640×480 o 1280×720). Si es así, el tope de 1600 px **nunca se alcanza** y subirlo no cambia nada. Para ganar calidad real hay que pedir una resolución mayor (`width`/`height` con `ideal`) y subir el tope y la calidad juntos. Comprobar con un teléfono real qué tamaño sale hoy: es lo primero.

### Capacidad del plan gratuito
Límites oficiales leídos el 2026-10-24 en [supabase.com/pricing](https://supabase.com/pricing) y en la [guía de límites de archivo](https://supabase.com/docs/guides/storage/uploads/file-limits) (verificado): **1 GB de almacenamiento de archivos, 5 GB de salida de datos (egress; la página no dice el período, otras fuentes dicen mensual), 50 MB por archivo, 500 MB de base de datos, 2 proyectos activos, y los proyectos gratuitos se pausan tras una semana sin actividad.** Vercel Hobby: unos 100 GB de transferencia al mes y uso **no comercial**; esto último sale de blogs, no de la documentación de Vercel: confirmar en `vercel.com/docs/limits` antes de decidir.

**Supuestos de la cuenta (estimación, no medidos):** una fiesta de 100 invitados con 5 fotos cada uno = 500 fotos. Tamaños típicos de JPEG: original actual de 1600 px y calidad 0,8, unos 0,25 a 0,5 MB; copia de 640 px, unos 0,04 a 0,08 MB; original de 2560 px y calidad 0,9, unos 1 a 2 MB.

| Escenario | Almacenamiento de una fiesta | Descargas: cada uno baja solo sus 5 | Descargas: todos bajan todo |
|---|---|---|---|
| Hoy (1600 px, 0,8) | ~0,2 GB | ~0,2 GB | ~20 GB |
| Intermedio (2048 px, 0,85) | ~0,4 GB | ~0,4 GB | ~40 GB |
| Alto (2560 px, 0,9) | ~0,8 GB | ~0,75 GB | ~75 GB |

Más la cartelera: si cada invitado mira las 500 copias de visualización, son unos 3 GB de salida por sí solos (500 × ~0,06 MB × 100 personas).

Conclusiones (estimación):
- **El cuello de botella es la salida de datos (5 GB), no el almacenamiento.** Ver la cartelera ya puede gastar más de la mitad del tope; «todos bajan todo» lo revienta incluso con la calidad actual.
- **El almacenamiento (1 GB) alcanza para una fiesta en calidad alta, pero no para dos** ni para fotos viejas acumuladas: el 1 GB es de todo el proyecto.
- Una descarga de calidad alta solo es viable si es **una por una o «solo las mías»**. Una descarga masiva (zip de todo el evento) queda fuera del plan gratuito.

### Propuesta (sin decidir)
1. Medir en un teléfono real qué resolución entrega hoy la cámara y cuánto pesa una foto de verdad (con y sin marco). Reemplaza los supuestos de arriba.
2. Pedir `ideal: 1920×1080` (o 2048) a la cámara y subir el original a 2048 px, calidad 0,85, como punto medio. Mantener la copia de 640 px para la cartelera: es lo que cuida la salida de datos.
3. Si la clienta quiere calidad máxima para imprimir: ofrecerla solo para la foto que el invitado abre, nunca en bloque.
4. Antes de la fiesta, mirar en el panel de Supabase el uso real de almacenamiento y de salida, y decidir si conviene el plan Pro durante el mes de la fiesta (decisión del dueño; tiene costo).
5. Riesgo aparte: un proyecto gratuito inactivo una semana se pausa. Ya hay un ping cada 3 días (`.github/workflows/keepalive.yml`), pero **solo corre si los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY` están en GitHub**; si no, termina sin error y sin avisar. Verificado el 2026-10-24: los dos secretos existen y la última ejecución (2026-10-23) hizo el ping de verdad (devolvió `[]`), así que el riesgo está cubierto.

## 3. Épica B: marcos

### Lo que está escrito como decidido (verificado)
En `backlog-diseno-y-marcos.md`:
- **Un marco es composición, no máscara.** Decora los bordes y deja libre el centro; **no se alinea con caras**. Lo que va sobre las personas son solo los stickers que el invitado coloca a mano.
- Zona segura: el centro libre (por ejemplo el 70 % central), en vertical, horizontal y con cámara frontal y trasera. Los textos nunca se cortan; las tipografías se cargan antes de dibujar; la vista previa dibuja con el mismo código que la cámara. Las fotos no se alteran (sin grano, viraje ni filtros).
- Plantillas de calidad con pocos parámetros en vez de un editor libre.

**Pendiente de confirmar con el dueño:** se dijo que ya se había decidido «cómo hacer los marcos», pero esa conversación se perdió al limpiar la sesión y en los documentos solo consta lo de arriba. Las cuatro preguntas del backlog siguen abiertas: cuántos marcos por evento y si los elige el invitado o rotan solos; qué se hace con los marcos que ya usa la clienta de la primera fiesta; si el editor de capas libre se retira o queda como opción avanzada; si la vista previa usa la cámara real o una foto de ejemplo. Si recuerdas lo decidido, dímelo y lo anoto aquí antes de construir.

### Estado del código (verificado)
Existen 7 plantillas (`border`, `polaroid`, `film`, `viewfinder`, `banner`, `glow`, `capas`), el editor de capas (`LayerEditor`), validación espejo en TypeScript y SQL, y una sola función de dibujo (`renderFrame`) para la vista previa y la foto final. Una plantilla nueva exige tocar la validación de TypeScript, la de SQL, la migración y el test de paridad.

### Propuesta de dirección de diseño (mía, sin decidir y sin pasar aún por las skills de diseño)
Pensada para fiestas informales (cumpleaños, carretes), con el estilo neón/rosa de la marca:
- **Pocas plantillas, muy bien hechas, en lugar de muchas.** Cuatro o cinco que cubran el caso de uso: borde con título y fecha; polaroid; «selfie» (adornos en los costados y el borde inferior, centro-arriba libre); tira o cinta superior con el nombre del evento; marco «de noche» con destello solo en los bordes.
- **Posición que rota por foto o por invitado** (la idea del backlog) como parámetro de una misma plantilla, no como plantillas aparte: da variedad al rollo sin que nadie elija.
- **Cada plantilla se prueba con tres fotos**: una persona, un grupo, un paisaje, en vertical y en horizontal, y con una captura de referencia.
- **Detalles de interacción** (cambio de marco por deslizamiento, disparo, rotación): animaciones cortas que respeten `prefers-reduced-motion`.
- Al construir: `design-taste-frontend` para el diseño de cada plantilla, `impeccable` para criticar y pulir el editor y la vista previa, `emil-design-eng` para los detalles de interacción de la cámara, y `animate` / `animation-performance` para las transiciones.

## 4. Épica C: lo que falta

Hechas: C1 (ver como invitado, 7 estados), C2 (vista previa del aviso), C4 (vista previa del estilo). Faltan:
- **C3. Vista previa de marcos** con una foto de ejemplo, en vertical y en horizontal, con el marco y los stickers del evento. Depende en parte de la épica B: conviene hacerla junto con el catálogo nuevo.
- **C5. Vista previa de la tarjeta del enlace (WhatsApp)** con título, subtítulo, descripción e imagen. Existe `api/event-meta.ts`, que ya genera esa tarjeta; falta mostrarla en el panel. Es la más barata y la más útil para la fiesta, porque el enlace se va a compartir por WhatsApp.
- **C6. Flujo del QR simulado**: qué ve un invitado al escanear el código, sin usar el código real (no exponer `activation_code`).

Reglas que siguen valiendo: sin llamadas a RPC de invitado ni tokens, sin exponer `activation_code`, sin crear invitados ni fotos reales; reutilizar los componentes del invitado en lugar de duplicarlos.

## 5. Orden propuesto (sin decidir)
1. **Medir** (punto 2.1): una foto real en un teléfono real. Es barato y decide la descarga.
2. **C5** (tarjeta de WhatsApp): chica, útil ya.
3. **Descarga de calidad** (2.2), si la medición lo justifica.
4. **B y C3** juntas: decidir el catálogo con el dueño, luego construir plantilla por plantilla con TDD y revisión móvil.
5. **C6** al final.

A seis días de la fiesta, lo de B es lo único grande; conviene decidir cuánto de B entra antes del 30 y cuánto después.
