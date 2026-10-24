# Pantalla de cámara del invitado

Fecha: 2026-10-24. Código: `src/components/CameraCapture.tsx`, `src/components/camera/` y `FilmRollCounter.tsx`. Origen: crítica de la cámara (21/40) y el plan del estudio de diseño (sección 9). Este documento cubre el **PR 1** (comportamiento y layout); el pulido (PR 2) y la partición del archivo (PR 3) siguen pendientes.

## Qué cambió en el PR 1
- **La foto no se pierde si falla la subida.** Antes `handleSend` borraba la foto al enviarla. Ahora se conserva en la revisión hasta que la subida salga bien; si falla, la revisión muestra el error («… Tu foto sigue aquí») y el botón **Reintentar** reenvía el mismo archivo. Un fallo no gasta el cupo: `usePhotoCapture` solo lo cuenta tras una subida exitosa. Mientras sube, «Enviar» y «Repetir» están deshabilitados. «Repetir» tras un fallo descarta la foto y limpia el error.
- **«Enviar // te quedarán N»** dice cuántos disparos quedan tras enviar; con un solo disparo restante aparece «Es tu última foto del rollo».
- **Cabecera baja.** El contador de rollo pasa a una versión compacta (`FilmRollCounter compact`: la ventanita y «de N»). El rótulo «Cámara // modo carrete» ya no ocupa la cabecera de la cámara activa (sigue en la pantalla de «Rollo terminado»). Flash y el botón de stickers viven a la derecha de la cabecera.
- **Stickers detrás de un botón.** «Stickers 0/5» abre y cierra la bandeja (`aria-expanded`). Cerrada por defecto: el visor no cede alto si nadie la pide. Con la bandeja abierta el visor se achica a propósito.
- **Controles al alcance del pulgar.** Una fila abajo, junto al obturador: **Cerrar**, flecha de marco, obturador, flecha de marco y **Cambiar cámara**, todos de 44 px o más y con caja visible y texto en papel pleno (antes eran gris tenue, y «Cerrar» y «Cambiar cámara» estaban arriba). La etiqueta del marco es un chip sobre la fila.

## Cuánto ocupa el visor (medido)
La crítica decía 42 % a 360×640 y 35 % a 390×844 y 430×932. **Esas cifras salían de la cámara falsa de Chromium, que entrega video 4:3 apaisado**: 270/640 = 42 % y 292/844 = 35 %. Un teléfono en vertical entrega 3:4. Para medir como lo vería el invitado, `scripts/qa-movil` tiene la escena `g11-camara-vertical` (sustituye `getUserMedia` por un lienzo de 480×640) y mide el visor como porcentaje del alto (`visor=NN%`).

| Tamaño | Antes (cámara vertical) | Después |
|---|---|---|
| 360×640 | 48 % | 74 % |
| 390×844 | 60 % | 62 % |
| 430×932 | 62 % | 62 % |
| Pixel 7 (412×915) | 60 % | 65 % |

En 390 y 430 de ancho el techo es el ancho (3:4: 62 % y 61 %), no los controles. Con video 4:3 apaisado (escena `g09`) el visor sigue en 42 % y 37 %: es la forma de la foto, no el layout.

## Lo que no hace
- **Deslizar para cambiar de marco** solo existía en la ruta antigua (sin marcos ni stickers); en el modo compositor de la Fase 1 nunca estuvo cableado, así que no hay choque con arrastrar stickers. El cambio de marco es solo con las flechas.
- En **horizontal** la fila del pulgar se parte en dos líneas (cabe en 240 px de columna).
- El aviso de éxito y los demás avisos siguen como antes (PR 2).
- **Foco y diálogo:** la revisión sigue siendo un `div` sin `role="dialog"` y no mueve el foco; al deshabilitarse el botón durante la subida el foco cae al `body` (PR 2).

## Riesgo conocido: reintento sin idempotencia
Cada intento de subida genera una ruta nueva (`crypto.randomUUID()` en `uploadGuestPhoto`) y `submit_photo` inserta siempre una fila nueva. Si el servidor **confirma** el registro y se pierde la respuesta (red de una fiesta), «Reintentar» sube otra copia, gasta un segundo disparo y duplica la foto; el tope del servidor se respeta igual, así que no se supera el cupo. Lo mismo si falla solo `submit_photo` («La foto se subió pero no pudimos registrarla»): el archivo anterior queda huérfano en Storage. Un fallo **antes** de que `submit_photo` confirme no gasta nada. Cerrarlo del todo pide generar la ruta una vez por foto y hacer `submit_photo` idempotente por `storage_path` (migración y prueba de base de datos); no entra en este PR. La ruta heredada `/i/:token` (Fase 0) además muestra el texto crudo de Supabase en ese error; se retira según la decisión D10.

## Verificación y límites
- Pruebas: `CameraCapture.test.tsx` (envío, error, reintento, doble envío), `.composer.test.tsx` (bandeja detrás del botón), `.layout.test.tsx` (controles abajo, contador en la cabecera), `FilmRollCounter.test.tsx` (compacto).
- Auditoría `scripts/qa-movil` (escenas `g09`, `g11`; perfiles `s360`, `s390`, `s430`, `pixel7`): sin desbordes, sin botones de menos de 44 px.
- **No probado en un teléfono real.** WebKit (iPhone simulado) no abre la cámara falsa, así que los tamaños de iPhone se midieron en Chromium con el mismo ancho y alto. Safari de iOS puede entregar otra proporción de video.
