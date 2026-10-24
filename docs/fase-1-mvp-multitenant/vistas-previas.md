# Vistas previas para la organizadora (épica C: C1, C2 y C4)

Fecha: 2026-10-24. Rama `feat/vistas-previas`. Origen: [`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md), épica C. Estado de la app: [`estado-del-producto.md`](./estado-del-producto.md).

## Qué hay
- **C1, pestaña «Vista previa» del panel.** Un teléfono de 390×844 con la pantalla del invitado y siete estados elegibles: inscripción, cámara bloqueada, cámara activa, avisos, fotos publicadas, cartelera vacía y cupo agotado.
- **C2, «Ver cómo queda» al redactar un aviso.** En los formularios de crear y de editar (solo con evento), el mismo teléfono muestra el borrador, con portada, subtítulo, cuerpo y galería, arriba de los avisos ya publicados y sin repetir el que se edita.
- **C4, «Ver cómo queda» en Ajustes.** Bajo «Estilo del evento» hay un botón que abre el mismo teléfono (cerrado por defecto: no carga nada hasta que se pide). Al elegir otro preset en la lista, el teléfono lo pinta al instante, sin guardar; el guardado sigue siendo el botón «Guardar ajustes».
- No existen todavía C3 (marcos), C5 (tarjeta del enlace) ni C6 (flujo del QR simulado).

## Cómo está hecho
- `GuestHubView` es la cartelera del invitado sin estado ni llamadas; `GuestHub` (el real) y la vista previa la alimentan. `EventHeader` es la cabecera compartida. Lo que ve la organizadora es el mismo código que ve el invitado.
- `GuestPreviewPage` (`/panel/e/:eventId/vista-previa`, tras `RequireAuth`) se abre dentro de un **iframe** (`PhoneFrame`). Así los puntos de quiebre, `100dvh` y las capas `fixed` miden un teléfono y no la ventana del panel, y el estilo del evento (variables CSS en `<html>`) no pisa al del panel. El teléfono se reduce hasta la mitad en pantallas angostas.
- Panel e iframe hablan por `postMessage` del mismo origen, validado en `src/lib/guestPreview.ts` (`parsePreviewMessage`, `parsePreviewNote`): estado, borrador y estilo (`themeId`) hacia el iframe; «listo» y la nota del estado de vuelta. El iframe lleva `sandbox="allow-scripts allow-same-origin"`: es un freno contra navegar el panel o abrir ventanas por accidente, no un aislamiento (con `allow-same-origin` la propia app podría quitárselo).
- La lógica de qué se ve en cada estado es pura (`buildPreviewScenario`) y está probada.

### Cómo viaja el estilo (C4)
- El preset va **en el mensaje** (`themeId`), nunca en la dirección: la dirección del iframe no cambia al elegir otra opción, así que no se recarga.
- `parsePreviewMessage` solo acepta ids que existen en `THEME_PRESETS` (o `null`, que deja el estilo guardado del evento). Un id inventado o un color suelto como `#00ff00` descarta todo el mensaje, de modo que no se puede pintar nada fuera de la paleta. Tests en `guestPreview.test.ts` y `GuestPreviewPage.test.tsx`.
- La página de la vista previa aplica el preset probado sobre una copia del evento; el evento guardado no se toca.

## Qué es real y qué es de ejemplo
| Real (con la sesión de la organizadora) | De ejemplo |
|---|---|
| Evento: nombre, subtítulo, fecha, lugar, estilo, forma de desbloqueo, formulario de inscripción | La invitada («Ana»), el aforo (12) y el cupo gastado (2 de los del evento) |
| Avisos publicados del evento | Las fotos publicadas: seis dibujos SVG (`src/lib/samplePhotos.ts`) |

## Garantías (y su test)
- **Sin `activation_code`:** `toPublicPreviewEvent` arma el evento público campo por campo; la dirección del iframe solo lleva el id del evento y el estado. Tests en `guestPreview.test.ts`, `GuestPreviewPage.test.tsx` y `GuestPreviewTab.test.tsx`.
- **Sin datos reales:** no se llama a ninguna RPC de invitado, no hay tokens y la inscripción se puede escribir pero no se envía (el envío se frena en captura). Test: «la inscripción se ve pero no se envía».
- **Fotos de ejemplo acotadas:** `getSignedPhotoUrl` y la URL de descarga devuelven tal cual solo las rutas exactas de `SAMPLE_PHOTOS`; cualquier otra ruta `data:` va al almacenamiento como siempre, para que una fila manipulada de `photos` no se sirva como imagen. Test en `photosApi.test.ts`.

## Límites conocidos
- La vista previa de Ajustes (C4) muestra siempre el estado «Cámara activa»: no enseña la pantalla de inscripción con el preset elegido. Para ver ese estado hay que guardar y abrir la pestaña «Vista previa».
- Al abrirla con un preset ya elegido puede verse un instante el estilo por defecto mientras el iframe carga (no medido en navegador).
- En el computador, el iframe no cumple `pointer: coarse`: los campos se ven a 14 px y no a 16 px como en un teléfono táctil.
- Los botones no hacen nada (abrir la cámara, mostrar el código); el visor de fotos sí abre, y su descarga queda bloqueada por el `sandbox`.
- Con la cartelera larga hay que desplazar dentro del teléfono para llegar al carrusel de fotos.
- Verificado con la auditoría de `scripts/qa-movil/` (escenas `o13` a `o18`) en WebKit iPhone 13, Chromium Pixel 7 y 360×640: sin desbordes, sin campos de menos de 16 px, sin botones de menos de 44 px y sin errores de JavaScript. **No se probó en un teléfono real.**

## Cómo ampliarla (C3–C6)
Agregar un estado a `PREVIEW_STATES` o a `buildPreviewScenario` (con su test) y, si necesita datos nuevos, pasarlos por el mensaje validado, nunca por la dirección. Mantener la regla: el evento público se arma campo por campo.
