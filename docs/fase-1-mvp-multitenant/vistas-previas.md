# Vistas previas para la organizadora (épica C: C1, C2, C4 y preview de cámara)

Fecha: 2026-10-24. Rama `feat/preview-camara-panel`. Origen: [`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md), épica C. Estado de la app: [`estado-del-producto.md`](./estado-del-producto.md).

## Qué hay
- **C1, pestaña «Vista previa» del panel.** Un teléfono de 390×844 con la pantalla del invitado y siete estados elegibles: inscripción, cámara bloqueada, cámara activa, avisos, fotos publicadas, cartelera vacía y cupo agotado. En el estado «Cámara activa», el botón «Abrir cámara» abre un preview real de la cámara del dispositivo con los marcos y stickers configurados para el evento, permitiendo ensayar el disparo y la revisión sin subir fotos a Storage ni alterar la base de datos.
- **C2, «Ver cómo queda» al redactar un aviso.** En los formularios de crear y de editar (solo con evento), el mismo teléfono muestra el borrador, con portada, subtítulo, cuerpo y galería, arriba de los avisos ya publicados y sin repetir el que se edita.
- **C4, «Ver cómo queda» en Ajustes.** Bajo «Estilo del evento» hay un botón que abre el mismo teléfono (cerrado por defecto: no carga nada hasta que se pide). Al elegir otro preset en la lista, el teléfono lo pinta al instante, sin guardar; el guardado sigue siendo el botón «Guardar ajustes».
- **C5, tarjeta del enlace (2026-10-24).** En la pestaña «Enlace», «Así se verá en WhatsApp» dibuja la tarjeta con título (el nombre del evento), descripción, imagen y dominio. La descripción sale de `describeEvent`, la misma función que usa `api/event-meta.ts` para los rastreadores, así que no se desalinean. La imagen es `public/og/<slug>.jpg`; si no existe (el sitio devuelve `index.html` y la imagen falla) la tarjeta se muestra sin imagen y lo dice. Avisa que WhatsApp puede tardar en actualizarla. Solo dibuja: no manda nada ni crea datos. Verificado con `o07` a 360 px (sin desbordes, sin campos <16 px ni botones <44 px); **no** se comprobó contra WhatsApp real ni en teléfono real.
- No existen todavía C3 (marcos sueltos) ni C6 (flujo del QR simulado).

## Cómo está hecho
- `GuestHubView` es la cartelera del invitado sin estado ni llamadas; `GuestHub` (el real) y la vista previa la alimentan. `EventHeader` es la cabecera compartida. Lo que ve la organizadora es el mismo código que ve el invitado.
- `GuestPreviewPage` (`/panel/e/:eventId/vista-previa`, tras `RequireAuth`) se abre dentro de un **iframe** (`PhoneFrame`). Así los puntos de quiebre, `100dvh` y las capas `fixed` miden un teléfono y no la ventana del panel, y el estilo del evento (variables CSS en `<html>`) no pisa al del panel. El teléfono se reduce hasta la mitad en pantallas angostas.
- El iframe lleva `allow="camera"` para permitir `getUserMedia` dentro del iframe de mismo origen, y `sandbox="allow-scripts allow-same-origin"`: es un freno contra navegar el panel o abrir ventanas por accidente, no un aislamiento (con `allow-same-origin` la propia app podría quitárselo).
- Panel e iframe hablan por `postMessage` del mismo origen, validado en `src/lib/guestPreview.ts` (`parsePreviewMessage`, `parsePreviewNote`): estado, borrador y estilo (`themeId`) hacia el iframe; «listo» y la nota del estado de vuelta.
- La lógica de qué se ve en cada estado es pura (`buildPreviewScenario`) y está probada.

### Cámara de ensayo en la vista previa
- `GuestPreviewPage` abre el componente real `<CameraCapture>` al pulsar «Abrir cámara».
- **Carga de recursos bajo demanda:** `useCameraAssets` acepta un tercer parámetro opcional (`loadFn`) que en la vista previa usa `listPreviewCameraAssets(event)`. Lee marcos y stickers con la sesión de la organizadora aplicando exactamente los mismos filtros de visibilidad que la RPC del invitado (`framesEnabled`/`stickersEnabled` del evento, piezas habilitadas y marco por defecto). No se pide nada hasta que la organizadora abre la cámara.
- **Aviso en cabecera:** `<CameraCapture>` acepta `previewNotice` (mostrado discretamente en la cabecera junto al rollo y en la pantalla de rollo agotado: «Vista previa: las fotos no se guardan»).
- **Subida simulada (`fakeUpload`):** no toca Supabase Storage ni RPCs de base de datos; resuelve inmediatamente un objeto `Photo` en memoria con estado `'approved'`.
- **Cupo local:** parte en `used: 0` sobre el total del escenario y se reinicia cada vez que se vuelve a abrir la cámara, permitiendo probar varios disparos y el flujo de rollo terminado sin afectar a ningún invitado real.

### Cómo viaja el estilo (C4)
- El preset va **en el mensaje** (`themeId`), nunca en la dirección: la dirección del iframe no cambia al elegir otra opción, así que no se recarga.
- `parsePreviewMessage` solo acepta ids que existen en `THEME_PRESETS` (o `null`, que deja el estilo guardado del evento). Un id inventado o un color suelto como `#00ff00` descarta todo el mensaje, de modo que no se puede pintar nada fuera de la paleta. Tests en `guestPreview.test.ts` y `GuestPreviewPage.test.tsx`.
- La página de la vista previa aplica el preset probado sobre una copia del evento; el evento guardado no se toca.

## Qué es real y qué es de ejemplo
| Real (con la sesión de la organizadora) | De ejemplo |
|---|---|
| Evento: nombre, subtítulo, fecha, lugar, estilo, forma de desbloqueo, formulario de inscripción | La invitada («Ana»), el aforo (12) y el cupo gastado (2 de los del evento) |
| Avisos publicados del evento | Las fotos publicadas: seis dibujos SVG (`src/lib/samplePhotos.ts`) |
| Cámara: hardware/video del navegador (`getUserMedia`) y marcos/stickers activos del evento | Disparos y subida: fotos no se guardan (`fakeUpload` en memoria), cupo simulado localmente |

## Garantías (y su test)
- **Sin `activation_code`:** `toPublicPreviewEvent` arma el evento público campo por campo; la dirección del iframe solo lleva el id del evento y el estado. Tests en `guestPreview.test.ts`, `GuestPreviewPage.test.tsx` y `GuestPreviewTab.test.tsx`.
- **Sin datos reales:** no se llama a ninguna RPC de invitado, no hay tokens y la inscripción se puede escribir pero no se envía (el envío se frena en captura). Test: «la inscripción se ve pero no se envía».
- **Sin subidas de fotos ni creación de filas:** la cámara de prueba usa un cargador de subida falso que nunca toca Storage ni la RPC `submit_photo`; los recursos de cámara solo se cargan si la organizadora abre la cámara. Test: «abre la cámara real en vista previa, cargando los recursos solo al abrir y sin guardar fotos en supabase».
- **Fotos de ejemplo acotadas:** `getSignedPhotoUrl` y la URL de descarga devuelven tal cual solo las rutas exactas de `SAMPLE_PHOTOS`; cualquier otra ruta `data:` va al almacenamiento como siempre, para que una fila manipulada de `photos` no se sirva como imagen. Test en `photosApi.test.ts`.

## Límites conocidos
- La vista previa de Ajustes (C4) muestra siempre el estado «Cámara activa»: no enseña la pantalla de inscripción con el preset elegido. Para ver ese estado hay que guardar y abrir la pestaña «Vista previa».
- Al abrirla con un preset ya elegido puede verse un instante el estilo por defecto mientras el iframe carga (no medido en navegador).
- En el computador, el iframe no cumple `pointer: coarse`: los campos se ven a 14 px y no a 16 px como en un teléfono táctil.
- El botón de código de puerta no hace nada; la cámara sí abre el visor real con marcos y stickers pero sin guardar fotos. El visor de fotos publicadas sí abre, y su descarga queda bloqueada por el `sandbox`.
- Con la cartelera larga hay que desplazar dentro del teléfono para llegar al carrusel de fotos.
- Verificado con la auditoría de `scripts/qa-movil/` (escenas `o13` a `o18`) en WebKit iPhone 13, Chromium Pixel 7 y 360×640: sin desbordes, sin campos de menos de 16 px, sin botones de menos de 44 px y sin errores de JavaScript. **No se probó en un teléfono real.**

## Cómo ampliarla (C3–C6)
Agregar un estado a `PREVIEW_STATES` o a `buildPreviewScenario` (con su test) y, si necesita datos nuevos, pasarlos por el mensaje validado, nunca por la dirección. Mantener la regla: el evento público se arma campo por campo.
