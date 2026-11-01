# Activación de la cámara, cartelera, estilo y subtítulo (Fase 1)

Esta página describe cuatro piezas que se decidieron juntas el 2026-10-23, a partir de lo que el dueño del producto precisó para la primera fiesta real (la de [primera clienta]).

## 1. La cámara se activa con el QR de la fiesta

**Decisión:** inscribirse NO habilita la cámara. La cámara se habilita cuando el invitado escanea, con la cámara normal de su teléfono, el QR impreso que está en la fiesta. Reemplaza al `on_identify` («al inscribirse») como modo por defecto de los eventos nuevos.

`events.camera_unlock` tiene ahora tres modos:

| Modo | Cuándo se habilita la cámara |
|---|---|
| `on_event_qr` (por defecto, recomendado) | Al escanear el QR de la fiesta. |
| `on_identify` | Apenas se inscribe. |
| `on_checkin` | Cuando el organizador marca su llegada en la puerta (escaneando el QR del invitado). |

Los eventos que ya existían **conservan** su modo; solo los nuevos usan el QR. Se cambia en Ajustes → «La cámara se habilita».

### Cómo funciona
- Cada evento tiene un `activation_code` (32 caracteres hexadecimales aleatorios). Es secreto: **no sale** en `get_event_public` ni en ninguna RPC de invitado; solo lo ve la dueña del evento en la pestaña **Activación** del panel.
- El QR apunta a `/e/:slug/a/:código`. Una sola ruta de React (`/e/:slug/*`) atiende el enlace normal y el del QR, para que la página no se reinicie cuando el código se quita de la dirección.
- Con sesión abierta, la cámara se activa en el acto (`activate_camera(token, código)`). Sin sesión, el invitado se inscribe o entra y se activa apenas está dentro. El código se quita de la dirección una vez usado.
- `activate_camera` devuelve `false` si el código no corresponde y lo cuenta como intento fallido (30 por IP y 200 por evento cada 10 minutos, como el resto de la inscripción).
- `submit_photo` exige la activación cuando el evento usa el QR (error `42501`). Es el candado real; el hub solo muestra u oculta la cámara.

### Riesgo conocido
El QR es, en el fondo, un enlace: alguien puede fotografiarlo y reenviarlo a quien no está en la fiesta. Se acepta a propósito (decisión del dueño). Lo limitan el cupo de fotos por invitado y que **ninguna foto se ve hasta que la dueña la apruebe y la publique**. Si se filtra, «Cambiar el código» en la pestaña Activación invalida el QR impreso; quienes ya activaron su cámara siguen activados.

## 2. Cartelera: anuncios y fotos del evento

La cartelera del invitado reúne:
- **Avisos** de la dueña (pestaña **Avisos** del panel, ahora atados al evento). Cada aviso puede llevar portada y una galería, que se muestra como carrusel.
- **Fotos de la fiesta**: un carrusel con las últimas 10 fotos publicadas (`PhotoCarousel`), con carga diferida y la copia liviana (`display`) si existe; tocar una foto abre el visor. Debajo sigue el rollo completo por horas (`RevealedRoll`).
- La lista de fotos se vuelve a pedir cada minuto mientras la página está a la vista. No hay tareas programadas ni Realtime.

### Las fotos se publican por lotes
**Decisión:** nada de procesos automáticos. La dueña revisa las fotos (aprueba o rechaza) y pulsa **Publicar** cuando quiere; cada vez se suman a la cartelera todas las aprobadas que faltaban.
- `photos.published_at`: una foto se ve solo si está **aprobada y publicada**. Aprobar no publica; rechazar una foto ya publicada la oculta.
- `publish_photo_batch(event_id)` (solo la dueña) publica el lote y devuelve cuántas fotos fueron. La primera vez también marca `events.photos_revealed_at`. Se puede repetir.
- Antes existía un único «revelado» de todo (`photos_revealed_at`). Lo ya revelado sigue visible: la migración publica las fotos aprobadas de los eventos ya revelados.
- La lectura en Storage (`party_photo_is_revealed`) usa la misma regla que `list_revealed_photos`.

## 3. Estilo por evento

Cada evento tiene su propio estilo; la app tiene una sola **estructura** (boleto, rollo, etiquetas de máquina, formas rectas) y cada evento elige su **piel** (los colores). Reemplaza a «la piel es de la rama»: el estilo ya no vive en una rama de git sino en el evento.

- `events.theme` guarda solo el id del preset, p. ej. `{"preset": "rosa-chicle"}` (la base valida la forma). Los colores viven en `src/lib/theme.ts`; un id desconocido cae en el neón de siempre.
- Presets: `neon` (el de antes, valor por defecto), `rosa-chicle` («Rosa chicle y negro», el de la primera fiesta), `vino-dorado`, `calabaza` y `gala` («Gala», negro, dorado mate y rojo, para eventos más formales). Un test comprueba el contraste WCAG AA de cada uno (texto sobre fondo y superficie, texto oscuro sobre el botón principal, acento/etiqueta/énfasis/error como texto).
- Los tokens de Tailwind (`ink-950`, `acid-400`…) conservan su nombre y ahora son variables CSS (`--c-ink-950`…, canales «r g b» para que `bg-acid-400/50` siga funcionando). Los valores por defecto están en `:root` de `globals.css`; un test comprueba que son los del preset `neon` (cero cambio sin tema).
- `ThemeScope` escribe las variables en `<html>` (así las ven también los modales y la cámara a pantalla completa), pinta la barra del navegador (`theme-color`) y lo restaura al salir. Se aplica al formulario de inscripción, al interior del invitado y al panel del organizador. La pantalla de «Cargando…» es neutra para no mostrar un destello del color equivocado.
- Roles: `bg`→`ink-950`, `surface`→`ink-900`, `border`→`smoke-700`, `text`→`paper-100`, `accent`→`acid-400` (la acción principal), `label`→`laser-500`, `emphasis`→`hotpink-500`, `error`→`flame-500`. El botón principal lleva el color de fondo como texto: en «Rosa chicle» el texto blanco sobre el rosa no pasa el contraste (2,8 contra 4,5).
- No cambia las fotos: los marcos de la cámara dibujan en un canvas con los colores de `event_frames`, independientes del estilo del evento.
- Los colores sueltos que siguen fijos están en código de la Fase 0 (`/admin`, `/i/:token`, `DoorList`, `statusFlash`), que no es parte de este flujo.

Se elige en Ajustes → «Estilo del evento» (se aplica al guardar).

## 4. Título y subtítulo

`events.name` es el título grande y `events.subtitle` (opcional, hasta 80 caracteres) una línea debajo. Aparecen en el formulario de inscripción, en el interior del invitado y en la vista previa del enlace (el subtítulo abre la descripción). Por ejemplo: título «NOCHE DE DISFRACES», subtítulo «Cumpleaños Martina».

## Despliegue y compatibilidad
La migración `20261024100013` es aditiva salvo que **recrea** `get_event_public` y `get_guest_by_token` (con columnas nuevas) y `submit_photo`, `list_revealed_photos` y `party_photo_is_revealed`. La web nueva tolera una base sin migrar (subtítulo nulo, estilo vacío, sin activación). Con la migración aplicada y la web vieja, los eventos existentes siguen funcionando porque conservan su modo de cámara. El Deploy aplica la migración antes de publicar la web.

## No verificado
- El flujo del QR en teléfonos reales (navegador interno de WhatsApp o Instagram en iOS, y que el almacenamiento de la sesión sobreviva al abrir el enlace desde la cámara).
- El estilo en pantalla real: se comprobó el contraste por cálculo y el render en Chromium y WebKit simulados, no en un iPhone ni un Android.
