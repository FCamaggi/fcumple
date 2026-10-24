# Prueba de recursos con IA (línea de una tinta)

Fecha: 2026-10-25. Es una prueba de un día para decidir si conviene tener un **catálogo de piezas** (orejas con moño, antifaz, gorrito, globos, destellos, corazones…) en el estilo de la invitación del evento piloto, en vez de dibujar cada pieza a mano en `generar-marcos-v2.py`. **No se agregó ningún recurso al repositorio**: solo este documento.

## Veredicto
- **Para la fiesta del 30-oct: NO-GO.** El evento usa los marcos actuales. Faltan 5 días, producción se congela 24 a 48 horas antes y nada de lo que habría que construir (ver más abajo) está hecho ni probado en un teléfono.
- **Para después de la fiesta: GO condicionado** a tres cosas que esta prueba no pudo cerrar: (1) leer los términos de OpenAI desde la fuente (hoy solo hay fuentes secundarias), (2) confirmar con Recraft si pasar por OpenRouter está cubierto por sus términos, y (3) generar las 10 piezas completas para ver si el estilo se mantiene.

## Qué se hizo y cuánto costó
Clave `OPENROUTER-KEY` con tope de 2 USD (nunca impresa). Gasto total: **0,186 USD**. Se generaron solo 3 imágenes, con texto, sin enviar a ningún servicio la invitación ni los marcos de la clienta (son material privado):

| Pieza | Modelo (vía OpenRouter) | Salida | Costo |
|---|---|---|---|
| Orejas con moño | `openai/gpt-image-2`, calidad media, 1K | PNG | 0,053 USD |
| Antifaz con destellos | `openai/gpt-image-2`, calidad media, 1K | PNG | 0,053 USD |
| Orejas con moño | `recraft/recraft-v4.1-vector`, 1K | SVG | 0,080 USD |

Los dos PNG se vectorizaron con **vtracer 0.6.15** (modo binario, curvas `spline`), la tinta se pasó a `currentColor` y se optimizó con **svgo 3.3.2**. El SVG de Recraft pasó por el mismo recoloreo y por `svgo`. El costo por imagen salió más alto que el 0,006 USD de la tabla de OpenRouter, que era con ajustes por defecto. Con calidad media, 10 piezas sin repetir ninguna cuestan unos 0,53 USD con GPT o 0,80 USD con Recraft; con descartes, de dos a tres veces eso.

## Términos de uso y licencias
OpenRouter no decide quién es dueño de lo generado: su §6.1 dice que los derechos sobre el *Output* «se establecen en los términos del modelo» y su §5.1 pone en quien lo usa la responsabilidad de leerlos.

| Fuente | Lo que dice (resumen) | Cómo se verificó |
|---|---|---|
| OpenRouter, Términos (actualizados 31-ago-2026) | §6.1: la propiedad del Output la fijan los términos de cada modelo. §6.2: si se activa el registro de prompts se concede a OpenRouter una licencia amplia, perpetua e irrevocable sobre prompts y respuestas. | Leído en la fuente. No se pudo comprobar desde aquí si esa opción está activada en la cuenta: **conviene revisarlo** antes de seguir. |
| Recraft, Developer Terms (20-oct-2026) | §6.2: «eres dueño de los Assets que creas con la API, para uso personal o comercial»; prohíbe usarlos para entrenar modelos de IA y para crear servicios que compitan con Recraft. §1.4: el acceso por reventa o plataforma se rige por un acuerdo aparte. | Leído en la fuente. **No dice si OpenRouter está cubierto.** |
| Recraft, Términos generales (21-oct-2026) | En el plan gratuito los Assets son de Recraft y sin uso comercial; en el de pago son del usuario. | Leído en la fuente. No se sabe a qué plan equivale la API por OpenRouter. |
| OpenAI, Términos de uso (propiedad del Output) | Quien usa «es dueño del Output»; OpenAI cede los derechos que tenga, «si los hubiera»; otros usuarios pueden recibir resultados parecidos. | **Solo fuentes secundarias**: `openai.com` devuelve 403 a la herramienta de lectura. No se pudo leer el texto vigente. |
| vtracer | Licencia MIT, © 2024 Hao Fung Tsang. | Leído en el repositorio y en el paquete instalado. Sin restricciones para la salida. |
| svgo | Licencia MIT. | No se leyó el texto en esta sesión; es la licencia que declara el proyecto. |
| potrace | GPL-2+ (copyleft). | Fuente secundaria. **No se usó**: vtracer es MIT y alcanza. |

Dos riesgos que ninguna licencia resuelve y que no son asesoría legal: lo generado por una IA puede no estar protegido por derechos de autor (en tal caso nadie, tampoco la organizadora, podría reclamarlo como exclusivo), y puede parecerse a obras existentes. **Regla para este repositorio: no se sube ninguna pieza generada mientras no haya una licencia clara y leída en la fuente.**

## Comparación

| | Marcos actuales (a mano) | GPT-image-2 + vtracer + svgo | Recraft vector (SVG nativo) |
|---|---|---|---|
| Aspecto | Formas rellenas, simples y gruesas; legibles en pequeño. | Línea fina de una tinta, muy cercana a la invitación; limpia. Las orejas salieron levemente asimétricas. | Línea más gruesa y simétrica, una sola figura; más «icono» que «dibujo». |
| Peso por pieza | Un marco completo: ~5 kB de JSON, 14 o 15 `path` de 116 caracteres de promedio (máximo 294). | 6,0 kB (orejas) y 6,5 kB (antifaz), cada una. | 2,8 kB, pero **el archivo original pesaba 23 kB**: ~17 kB eran un manifiesto C2PA en `<metadata>` que hubo que quitar. |
| Costo por pieza | Horas de trabajo. | 0,053 USD | 0,080 USD |
| Recolorear | Es una propiedad de la capa. | Sí, sustituyendo `currentColor` como texto antes de crear la imagen. | Igual (un solo `fill`). |
| Licencia clara | Propia. | Pendiente (fuente primaria de OpenAI sin leer). | Pendiente (¿cubre OpenRouter?). |
| Consistencia de estilo | Total (las dibuja un script). | **No probada**: solo 2 piezas. | **No probada**: solo 1 pieza. |

## Hallazgos técnicos (comprobados)
- **El trazo fino casi desaparece a tamaño de sticker.** A 56 px, que es lo que mide un sticker en el visor del teléfono, las tres piezas se ven muy tenues (hoja comparativa generada en esta prueba). Habría que pedir un trazo más grueso en el prompt o engrosarlo al vectorizar, y volver a mirarlo en un teléfono.
- **`svgo` con `removeXMLNS` rompe el uso como imagen.** Sin `xmlns` el SVG se ve bien incrustado en HTML, pero no se puede decodificar como `<img>`, como `data:` URI ni con `drawImage`. Hay que dejar `xmlns`.
- **`currentColor` no se hereda dentro de una imagen.** El color se sustituye como texto en el SVG antes de generar el `data:` URI; si no, sale negro.
- **Contaminación del canvas.** Con un `data:` URI, las tres piezas se dibujaron en un `<canvas>` y `toDataURL()` funcionó, en **Chromium**. Safari no se probó (era el riesgo conocido con SVG desde un `blob:`).
- **El SVG de Recraft trae credenciales de contenido C2PA.** Hay que quitarlas (pesan más que el dibujo) y, si se conserva el aviso de «hecho con IA», declararlo en otro lugar.
- **La app hoy rechaza SVG.** Lo que suben los organizadores solo puede ser PNG, WebP o JPG: se reprocesa a WebP y se descartan los metadatos (`processStickerImage`). Es deliberado: un SVG puede llevar scripts y el bucket de recursos es público.
- **Una pieza vectorizada no cabe en una capa `path`.** La capa `shape` de tipo `path` admite solo `M L C Z` y 600 caracteres; el tope de un marco son 16 kB y 40 capas.

## Qué haría falta para tener presets nuevos
1. **Una capa `asset`** (nueva) que referencie una pieza del catálogo por id y no por ruta de Storage ni por trazo incrustado, con tamaño, posición, rotación y color. Requiere **migración** (`valid_frame_layer`), validación espejo en `layers.ts` y un **test de paridad** SQL/TypeScript, como ya existe para las otras capas.
2. **Un catálogo en el repositorio** (`/packs`), con las piezas ya revisadas y con licencia leída, servido con la aplicación. Así no hay carga de SVG por parte de usuarios y se mantiene el rechazo actual. Cada pieza lleva su fuente, licencia y fecha en un archivo de metadatos.
3. **Recoloreo:** sustituir `currentColor` por el color del tema (`src/lib/theme.ts`) en el texto del SVG y recién entonces crear un `data:` URI; **no** usar `blob:` (riesgo de contaminar el canvas en Safari).
4. **Grosor y tamaño mínimo** definidos por pieza, probados a 56 px en un teléfono.
5. **Estudio:** selector de piezas y vista previa; esto ya es el alcance del punto D del plan (después de la fiesta).
6. **Pruebas:** parseo del SVG (solo etiquetas permitidas), tope de peso por pieza, y que el compositor dibuje la capa igual en la vista previa y en la foto final.

## Lo que esta prueba no verificó
- Que el estilo se mantenga en las **10 piezas**; solo se generaron 3.
- Los términos de OpenAI desde la fuente, y si Recraft cubre el acceso por OpenRouter.
- Si el registro de prompts de OpenRouter está activado en la cuenta (los prompts enviados fueron genéricos y sin datos personales).
- Safari, y ninguna prueba en un teléfono real.
- Si la aplicación debería avisar que una pieza fue hecha con IA.
