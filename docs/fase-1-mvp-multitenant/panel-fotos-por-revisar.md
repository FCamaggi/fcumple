# Fotos por revisar en el panel (épica D, etapa 2)

Fecha: 2026-10-24. Rama `feat/insignia-fotos`. Origen: [`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md), épica D. Estado de la app: [`estado-del-producto.md`](./estado-del-producto.md).

## Qué hay
- La pestaña «Fotos» muestra una insignia con la cantidad de fotos **por revisar** (pendientes), visible desde cualquier pestaña del panel. Con cero no se dibuja; con más de 99 dice `99+`. Un lector de pantalla oye «Fotos, 3 por revisar».
- **Sin sondeo.** Las fotos se vuelven a pedir al cambiar de pestaña y con «Actualizar» en «Hoy». Mientras la organizadora se queda en una pestaña, la cuenta no se mueve sola.
- Si no se pueden leer las fotos, la insignia desaparece: se prefiere no mostrar una cuenta que podría estar vieja.

## Dónde vive el estado
`useEventPhotos` se llama una vez en `OrganizerEventPage` y su resultado baja por prop (`photos`) a `PhotosTab` y `PartyDayTab`; la insignia sale de `photos.counts.pending`. Antes cada pestaña lo llamaba por su cuenta y pedía la lista al montarse; ahora hay una sola copia, así que la insignia y las dos pestañas no pueden discrepar. El hook acepta `event: null` (mientras el evento carga no pide nada).

- Cada cambio de pestaña pide la lista otra vez (`reload`), conservando la anterior en pantalla hasta que llega la nueva (no hay parpadeo de «Cargando»).
- Abrir y cerrar la revisión también la piden otra vez, como antes.

## Límites conocidos
- La cuenta puede estar desactualizada hasta el siguiente cambio de pestaña o «Actualizar»: una foto que llega mientras se mira «Invitados» no se refleja sola. Es a propósito (sin sondeo); un aviso en tiempo real queda para la Fase 3.
- Cada cambio de pestaña hace una petición de lista de fotos, aunque la pestaña no las use.
- No se probó en un teléfono real.

## Qué corrigió la revisión
- Publicar desde la revisión parte del evento más reciente (no del que había al montar la página): si no, tras guardar Ajustes, publicar habría devuelto al panel el nombre, el tema y la cuota viejos.
- Recargar limpia también el aviso «Publicaste N foto(s)», que ahora vive en la página y si no reaparecería al volver a «Fotos» u «Hoy».
- Tras una lectura fallida, la siguiente recarga suelta las fotos viejas: la insignia no reaparece con una cuenta dudosa mientras llega la respuesta.
- Sin corregir, a propósito: al pasar de `/panel/e/A` a `/panel/e/B` sin desmontar la página, durante un render se ven los datos de A (ya pasaba antes de esta etapa).
