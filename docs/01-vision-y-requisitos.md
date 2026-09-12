# Invitación de Cumpleaños Web — Visión y Requisitos

## 1. Resumen ejecutivo

App web personal que empieza en la invitación pero está pensada para ser el **hub central desde el que organizás todo el cumpleaños**, no solo una tarjeta digital. Cumple, desde v1, dos funciones a la vez:

1. **Invitación pública personalizada**: cada invitado recibe un link único (`/i/{token}`) que, al abrirlo, ya sabe quién es sin que tenga que escribir nada (ni nombre, ni clave, ni email).
2. **Panel de administración privado**: tu centro de mando para organizar el cumpleaños completo. Quién confirmó, quién no ha respondido, cuántos +1 trae cada uno, notas, y el conteo total de gente que vas a tener.

No es solo una invitación bonita, es la herramienta que vas a usar activamente las semanas previas al evento para tomar decisiones (cuántas sillas, cuánta comida, a quién recordarle que responda). Y está construida sabiendo que va a crecer: en v2 se suman más secciones al mismo hub (blog/noticias, vistas de admin extendidas, galería de fotos) — ver sección 8. Eso no cambia lo que hay que construir en v1, pero sí cómo se construye: el modelo de datos y la navegación de v1 dejan espacio para ese crecimiento en vez de cerrarlo (ver `02-arquitectura-tecnica.md`, sección 8).

## 2. Objetivo del proyecto

Reemplazar el típico grupo de WhatsApp caótico y el Excel manual por un sistema donde:

- Vos generás un link por invitado desde el panel.
- Se lo mandás por el canal que quieras (WhatsApp, mensaje directo, lo que sea, eso queda fuera del sistema).
- El invitado abre su link, ve una invitación con su nombre, responde si va o no, cuántos acompañantes trae, y deja una nota si quiere.
- Vos ves todo consolidado en tiempo real en el panel.

Como plus (no como requisito duro): que la app en sí sea una demostración de que sos desarrollador de software, sin que eso opaque la función principal, que es organizar el evento.

## 3. Usuarios y roles

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **Invitado** | Cualquier persona con un link válido | Ver su invitación personalizada, responder asistencia, indicar +1, dejar nota, editar su respuesta después si cambia de opinión |
| **Admin (vos)** | Solo vos | Todo lo del invitado, más: crear/editar/eliminar invitados, generar links, ver estadísticas agregadas, ver notas privadas, exportar datos, configurar los datos del evento (fecha, lugar, tema) |

No hay rol de "invitado con cuenta". La identidad del invitado la da el token del link, no un login. Esto es intencional: pediste que el invitado no tenga que hacer nada.

## 4. Historias de usuario clave

- Como admin, quiero cargar una lista de invitados y que el sistema me genere un link único por cada uno, para poder mandarlos manualmente.
- Como admin, quiero ver de un vistazo cuántos confirmaron, cuántos rechazaron, cuántos no han respondido, y el total de personas contando +1.
- Como admin, quiero dejar notas privadas sobre un invitado (ej: "es vegetariano", "capaz llega tarde") que el invitado nunca vea.
- Como invitado, quiero abrir mi link y ver mi nombre puesto ahí, sin tener que loguearme ni escribir nada para identificarme.
- Como invitado, quiero poder decir cuántas personas más traigo (+1, +2) dentro de un límite que vos definiste para mí.
- Como invitado, quiero poder cambiar mi respuesta después si algo cambia.
- Como admin, quiero poder exportar la lista final (nombre, estado, +1, notas) para organizar la logística real del día del evento.

## 5. Requisitos funcionales (v1, lo mínimo indispensable)

**Gestión de invitados (admin)**
- RF1: Crear invitado (nombre, cupo máximo de +1 permitido, nota privada opcional).
- RF2: Editar y eliminar invitado.
- RF3: Generar automáticamente un token único e imposible de adivinar para cada invitado.
- RF4: Copiar el link completo de un invitado con un clic.
- RF5: Listar todos los invitados con su estado (pendiente / confirmado / rechazado).

**Panel de estadísticas (admin)**
- RF6: Ver totales: invitados totales, confirmados, rechazados, pendientes.
- RF7: Ver headcount real (confirmados + suma de sus +1 confirmados), que es el número que de verdad importa para logística.
- RF8: Buscar y filtrar invitados por estado.
- RF9: Exportar la lista a CSV.

**Invitación pública (invitado)**
- RF10: Al abrir `/i/{token}`, mostrar una página personalizada con el nombre del invitado y los datos del evento (fecha, hora, lugar, tema).
- RF11: Formulario de respuesta: asiste / no asiste, cantidad de +1 (respetando el máximo asignado por el admin), nota o comentario libre.
- RF12: Si el invitado ya respondió antes, mostrar su respuesta actual y permitirle editarla.
- RF13: Confirmación visual clara después de responder.

**Configuración del evento (admin)**
- RF14: Un lugar único donde editar nombre del evento, fecha, hora, ubicación, tema, y fecha límite de respuesta (RSVP deadline).

## 6. Requisitos no funcionales

- RNF1: Todo el hosting y servicios deben estar en tiers gratuitos, sin tarjeta de crédito comprometida a cobros.
- RNF2: La página del invitado debe ser usable perfectamente desde el celular (la mayoría va a abrir el link desde WhatsApp en el teléfono).
- RNF3: Un invitado nunca debe poder ver ni modificar los datos de otro invitado (aislamiento por token).
- RNF4: El sistema debe seguir siendo simple de mantener por una sola persona (vos), sin infraestructura que requiera monitoreo constante.
- RNF5: Debe soportar sin degradación el escenario de "pico de carga": varios invitados abriendo el link al mismo tiempo el día que mandás la tanda de invitaciones.
- RNF6: El panel de admin debe estar protegido, aunque sea con un mecanismo simple (dado que hay un solo admin).
- RNF7: El modelo de datos y la estructura de rutas de v1 deben poder extenderse a un hub con más secciones (blog, galería, más vistas de admin) sin requerir una reescritura arquitectónica — ver `02-arquitectura-tecnica.md` sección 8. Esto no obliga a construir esas secciones en v1, solo a no tomar decisiones de v1 que las bloqueen.

## 7. Fuera de alcance para v1

Dos grupos distintos, para no confundir "todavía no" con "nunca":

**Roadmap confirmado para v2 — no se construye ahora, pero es dirección de producto ya decidida** (detalle en sección 8):
- Blog/noticias público para avisos y novedades del evento.
- Vistas de admin extendidas para tu organización personal (logística, presupuesto, y lo que se defina al planificar v2).
- Galería/momentos con cámara in-app y cupo de fotos por invitado.

**Fuera de alcance, sin plan de agregar:**
- Envío automático de invitaciones por email o WhatsApp (v1 es copiar y pegar el link manualmente).
- Notificaciones push o recordatorios automáticos a quien no ha respondido.
- Subida de foto de perfil o mensaje personalizado en video por invitado.
- Multi-evento (la app sigue siendo para *un* cumpleaños, no una plataforma genérica de eventos, incluso creciendo como hub).
- Sistema de regalos o lista de deseos.

## 8. Visión de producto a futuro (v2+): el hub del cumpleaños

La invitación y el RSVP son el punto de entrada, no el límite del proyecto. La intención es que esta app sea el **centro de organización completo** del cumpleaños — el lugar único al que vos (admin) y tus invitados vuelven, en vez de que la invitación sea un evento aislado y el resto de la organización viva disperso (grupos de WhatsApp, notas sueltas, carpetas de fotos en distintos celulares).

Esto **no cambia el alcance de v1** (sigue siendo invitación + RSVP + admin básico, sección 5), pero sí cambia cómo se construye v1: la arquitectura de datos y de navegación se piensa desde ahora para que agregar estas secciones después sea incremental, no una reescritura (ver RNF7 y `02-arquitectura-tecnica.md` sección 8).

Secciones confirmadas para v2 (el orden de prioridad entre ellas se define al planificar esa fase, no está decidido todavía):

- **Blog/noticias público**: avisos y novedades visibles para los invitados sin que tengan que volver a preguntar por WhatsApp ("cambió la hora", "el dress code es tal", "acá está el link del grupo de Spotify"). Vive dentro del mismo hub, no en un canal aparte.
- **Vistas de admin extendidas**: paneles adicionales para tu propia organización personal del evento, más allá de la lista de invitados y el headcount. Ejemplos abiertos a definir al planificar v2: logística, presupuesto, timeline del día, proveedores, playlist.
- **Galería/momentos con cámara in-app**: cada invitado tiene un cupo limitado de fotos que puede tomar directamente desde la app, en un modo cámara dedicado — como una cámara descartable circulando en la fiesta (rollo limitado), no un scroll infinito de celular. Es una idea con identidad propia fuerte para este proyecto. Queda **confirmada como dirección de producto**, pero su especificación (cuántas fotos, si se ven al momento o se "revelan" después del evento, si hay moderación del admin antes de publicarse) se define recién cuando se planifique v2 en detalle — no es una spec cerrada todavía.

Estas tres secciones están confirmadas como parte de la visión del producto, no como "ideas sueltas que tal vez se hagan". Lo que queda abierto es el orden y el detalle de cada una, no si se hacen.

## 9. Métricas de éxito

- El día que mandás los links, cero invitados reportan error al abrir su página.
- Podés responder en cualquier momento "¿cuánta gente tengo confirmada hoy?" en menos de 5 segundos mirando el panel.
- No tuviste que tocar una hoja de cálculo aparte en ningún momento del proceso.
