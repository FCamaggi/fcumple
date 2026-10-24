# Revisión móvil del panel: Invitados, Inscripción y «Hoy» (épica D, etapa 4)

Fecha: 2026-10-24. Rama `feat/revision-movil-d4`. Origen: [`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md), épica D. Método: la auditoría de `scripts/qa-movil/` (README ahí) con una escena nueva, `o19-hoy`, más las existentes `o02` (Invitados) y `o08` (Inscripción), y lectura de las capturas a 360 px.

## Resultado de las mediciones
En iPhone 13 (WebKit), Pixel 7 (Chromium), 360×640 y los dos horizontales, las tres pantallas: **sin desbordes, sin campos de menos de 16 px y sin botones de menos de 44 px**.

## Lo que se vio en las capturas
- **«Hoy» (primera vez renderizada).** Las dos tarjetas caben en 360 px, con botones de 44 px y la insignia en la pestaña «Fotos» (la fila de pestañas se corta a la derecha, a propósito, para avisar que hay más). **Defecto corregido:** la lista de quienes aún no activan la cámara solo tenía rótulo para lectores de pantalla (`aria-label`); a la vista, dos nombres bajo «8 de 10 activaron la cámara» se leían como los que ya la activaron. Ahora lleva a la vista «Les falta activar:», enlazado a la lista con `aria-labelledby`.
- **Inscripción.** Una columna, campos amplios, el botón «Guardar inscripción» al final (la página mide unos 2600 px). Sin cambios.
- **Invitados.** Sin desbordes. «Quitar» y «Restablecer acceso» piden confirmación (`window.confirm`), así que un toque accidental no borra a nadie.

## Observaciones sin cambiar (a decidir)
- **La lista de Invitados es muy larga en el teléfono:** con 11 invitados mide unos 2600 px (cada fila, 3 líneas de botones y enlaces). Con 50 serían unos 12 000 px y no hay buscador ni filtro en esa pestaña; la búsqueda por nombre existe solo en «Puerta». Candidato a backlog: un buscador en Invitados, o filas más compactas.
- «Guardar inscripción» queda al final de un formulario largo; podría quedar fijo abajo.

## No verificado
Todo es con WebKit y Chromium simulados y datos inventados (`mock.js`); no se probó en un teléfono real ni con una lista de invitados larga de verdad.
