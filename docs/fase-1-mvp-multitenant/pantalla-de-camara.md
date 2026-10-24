# Pantalla de cámara del invitado

Fecha: 2026-10-24. Código: `src/components/CameraCapture.tsx`, `src/components/camera/` y `FilmRollCounter.tsx`. Origen: crítica de la cámara (21/40) y el plan del estudio de diseño (sección 9). Este documento cubre el **PR 1** (comportamiento y layout) y el **PR 2** (pulido, más abajo); la partición del archivo (PR 3) sigue pendiente y solo se hará si el PR 1 y el PR 2 se prueban antes en un teléfono real.

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
- (El aviso de éxito y el foco de la revisión eran pendientes del PR 1; se resolvieron en el PR 2, más abajo.)

## Reintento idempotente (2026-10-24)
**El problema.** Si el servidor confirmaba el registro y se perdía la respuesta (la red de una fiesta), «Reintentar» subía otra copia con otra ruta, gastaba un segundo disparo y duplicaba la foto. El tope del servidor se respetaba, pero se perdía un disparo.

**La solución, en dos partes.**
- **Cliente** (`uploadGuestPhoto`, `src/lib/platformGuestApi.ts`): la ruta se decide una vez por archivo (un `WeakMap` de `Blob` a UUID), así que reintentar el mismo archivo usa la misma ruta y la misma copia liviana. Si Storage responde 409 (el archivo ya estaba) cuenta como subido.
- **Base de datos** (migración `20261024100015_submit_photo_idempotente.sql`): `submit_photo` busca la ruta antes de contar el cupo. Si ya existe, devuelve esa fila: no cuenta contra el cupo (ni con el rollo agotado), no modifica la fila: ni su estado ni su copia liviana, que se fija solo al insertar (completarla después permitiría cambiar lo que muestra el rollo de una foto ya moderada; si el primer intento no la registró, la foto se muestra con el original). Dos reintentos simultáneos caen en la misma fila (`on conflict … do nothing` y relectura). Siguen igual la activación de la cámara, el prefijo `{event_id}/{guest_id}/` (nadie puede reclamar la ruta de otro) y el cupo para fotos nuevas.

**Pruebas.** `supabase/tests/guest-rpcs.test.ts` («reintento idempotente»: misma fila, sin gastar cupo, con el último disparo, estado conservado, copia liviana intacta incluso con la foto aprobada, activación y ruta ajena) y `src/lib/platformGuestApi.test.ts` («reintento del mismo archivo»). No hay prueba de concurrencia real: la rama de `on conflict` no se ejercita en serie.

**Límites.** Contrato del cliente: un `Blob` = una foto (reusar el mismo `Blob` para otra devolvería la primera). Un 409 puede darse mientras otra subida de la misma ruta sigue en vuelo (doble toque): ventana mínima, y `submit_photo` no verifica que el objeto exista. Dos fotos **nuevas** simultáneas pueden pasar el cupo (el `count` sin bloqueo es anterior a este cambio; se cierra con `perform 1 from guests where id = … for update` antes del conteo) y las rutas no rechazan `..` (también anterior): quedan como pendientes. Un archivo huérfano en Storage (subió pero nunca se registró y el invitado abandonó la foto) sigue ahí: `anon` no puede borrarlo. La ruta heredada `/i/:token` (Fase 0) usa `uploadPhoto`, que no es idempotente, y además muestra el texto crudo de Supabase en sus errores; se retira según la decisión D10.

## Pulido de la cámara, PR 2 (2026-10-24)
Código: `CameraCapture.tsx`, `FilmRollCounter.tsx`, `camera/ComposerStage.tsx`, `GuestHub.tsx`. Pruebas: `CameraCapture.ritual.test.tsx`.

- **Ritual del rollo.** El dígito baja **al disparar**, no al enviar: mientras la foto espera en la revisión el disparo está reservado y «Repetir» lo devuelve. El cupo real sigue gastándose solo al subir con éxito (en el instante del éxito `quota` ya lo cuenta y la reserva se suelta para no restarlo dos veces; un test observa cada cambio del contador para fijarlo). Como la revisión cubre toda la pantalla, **se monta 200 ms después** del disparo (de inmediato con movimiento reducido) para que se alcance a ver el tic; mientras no existe, un segundo toque sobre el obturador no puede caer en un «Enviar» invisible.
- **Error del PR 1 corregido: la segunda foto no se podía enviar con el sello visible.** El sello se queda hasta tocar «Ok» y `state.phase` seguía en `success`; la revisión de la foto siguiente calculaba `uploading = … || success`, así que mostraba «Enviando…» deshabilitado para siempre y solo dejaba «Repetir». Ahora disparar descarta el sello (`reset()`). Lo encontró el revisor de tipos; se reprodujo con un test antes de corregirlo.
- **Sello «Quedó en el rollo».** Reemplaza al aviso verde: borde y texto en el acento, se «estampa» (escala 1,12 a 1, 220 ms) y, si la foto pasa por moderación, lo dice debajo.
- **Salida en «se acabó el rollo».** Antes, al enviar la última foto, `outOfShots` pasaba a `true` en el mismo instante del éxito y la pantalla «Rollo terminado» reemplazaba a la cámara: el aviso de éxito nunca se veía. Ahora esa pantalla muestra el sello y mueve el foco a «Cerrar».
- **Un solo acento.** En la cámara el único color vivo es `hotpink` (el rol «el botón de la cámara» de `theme.ts`: obturador, «Enviar», sello, sticker seleccionado). Dejaron de ser `acid-400`: el dígito del contador compacto (el contador del hub, sin `compact`, no cambió), el flash activo (ahora papel, como «Stickers» abierto), la guía de encuadre de la ruta antigua y el contorno del sticker seleccionado. `flame-500` queda solo para errores y el rollo agotado.
- **Foco y avisos.** La revisión es `role="dialog"` modal con nombre; el foco entra en «Enviar», se queda ahí durante la subida (`aria-disabled`, no `disabled`, que lo soltaba al `body`) y un segundo toque no sube dos veces; tras un fallo queda en «Reintentar» y al cerrar la revisión vuelve al obturador. Una región `aria-live` educada dice «Enviando la foto…». El chip del marco es una región viva: el cambio de marco se anuncia. El «Ok» de los avisos mide 44 px.
- **Boleto del evento.** El nombre del evento va tras una perforación en la misma línea del chip del marco (`GuestHub` lo pasa desde `event.name`; `GuestPage`, la ruta antigua, no lo pasa y no muestra boleto). No quita alto al visor: la auditoría da 74 %, 62 %, 62 % y 65 %, igual que antes.

**Auditoría `scripts/qa-movil`:** escenas `g09`, `g11` y las nuevas `g12-revision-camara` y `g13-sello-enviado`, perfiles `s360`, `s390`, `s430` y `pixel7`: sin desbordes, sin campos de menos de 16 px y sin objetivos de menos de 44 px. Se miraron las capturas de 360 y 390.

**Fondo inerte y Escape.** Con la revisión abierta, el resto de la cámara recibe `inert` (Tab no la alcanza y «Cerrar» no desmonta una foto pendiente) y Escape equivale a «Repetir» si no está subiendo.

**Lo que no se hizo.** La cámara en sí (`<div aria-label>` sin `role`) no es un diálogo modal: solo lo es la revisión, y la página de detrás de la cámara no queda `inert`. El sello de la última foto se monta con el texto ya puesto, y las regiones vivas así insertadas se anuncian de forma poco fiable en algunos lectores. «Enviando…» se anuncia dos veces (el nombre del botón y la región viva). Con Enter mantenido, la repetición de teclas podría activar «Enviar» al recibir el foco.

## Verificación y límites
- Pruebas: `CameraCapture.test.tsx` (envío, error, reintento, doble envío), `.composer.test.tsx` (bandeja detrás del botón), `.layout.test.tsx` (controles abajo, contador en la cabecera), `FilmRollCounter.test.tsx` (compacto).
- Auditoría `scripts/qa-movil` (escenas `g09`, `g11`; perfiles `s360`, `s390`, `s430`, `pixel7`): sin desbordes, sin botones de menos de 44 px.
- **No probado en un teléfono real.** WebKit (iPhone simulado) no abre la cámara falsa, así que los tamaños de iPhone se midieron en Chromium con el mismo ancho y alto. Safari de iOS puede entregar otra proporción de video.
