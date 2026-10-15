# Brief de Diseño — La Visión del Usuario

> Este documento no es un requisito funcional ni una decisión técnica. Es la traducción fiel de lo que el dueño del proyecto pidió para el estilo visual de la invitación, puesta en un formato que se pueda usar como brief de diseño real (para vos, para Stitch, para quien lo lea después). El objetivo es que quede tan claro que nadie tenga que volver a preguntar "¿pero cómo querías que se viera?".

## 1. El pedido, en una frase

Una invitación de cumpleaños que en su estética se sienta **más discoteca que fiesta de cumpleaños tradicional**: que quien la abra sienta que le están invitando a una noche de carrete completo — música, luces, gente, movimiento — no a una once con torta y globos.

## 2. Punto de partida: Stitch

- La base de estilo se va a construir a partir de un mockup generado en **Stitch** (la herramienta de diseño de UI con IA de Google).
- Este documento (`DESIGN.md`) es el brief que alimenta ese mockup: paleta, tipografía, tono, referencias y qué evitar. Stitch propone las pantallas; este brief es el criterio con el que se aceptan, se corrigen o se rechazan esas propuestas.
- Ningún mockup de Stitch se acepta "tal cual" solo porque Stitch lo generó — se evalúa contra los principios de la sección 4 de `DESIGN.md`, especialmente el de "cero estética default de IA".

## 3. El tono exacto que se pidió

- **Discoteca, no cumpleaños de cartulina.** Nada de globos, confeti de emoji, tipografías redondeadas "kawaii", ni paleta pastel de fiesta infantil.
- **Carrete full — noche, música, gente.** La sensación debe evocar la previa de salir: expectativa, energía, oscuridad con luces de color cortando, no una tarjeta de invitación impresa escaneada.
- **Fluido y dinámico.** La interfaz no puede sentirse estática ni de formulario burocrático. Tiene que tener movimiento con propósito: transiciones, animaciones, algo que se sienta vivo cuando se interactúa con ella.
- **Componentes únicos.** No se acepta como resultado final un botón, tarjeta o input que se vea como el default de una librería de componentes sin trabajar. Cada pieza visible (botón de RSVP, tarjeta de invitado, contador de confirmados) debe tener personalidad propia, diseñada para este proyecto.

## 4. Lo que explícitamente NO se quiere (restricción dura)

Esto es el punto más importante del pedido y el que más fácil se pierde si no se deja escrito:

- **Nada de "paleta de colores de IA".** El pedido fue explícito: evitar el degradado violeta-azul-índigo que domina cualquier producto generado con IA en 2024-2025, y evitar el modo oscuro genérico con acentos "SaaS" (ese azul eléctrico corporativo que aparece en todos lados).
- **Nada de "elementos típicos de IA".** Esto incluye, sin limitarse a: glassmorphism genérico sin razón, tarjetas con `border-radius` grande y sombra suave flotante, iconografía de check-en-círculo, tipografía `Inter`/`system-ui` sin intención, layouts centrados con mucho espacio en blanco vacío que se sienten "landing page de startup", y cualquier microinteracción que se vea sacada de un template.
- Si en algún punto del proceso el resultado se parece a "otro producto más hecho con IA", se considera que no se cumplió el pedido, aunque técnicamente funcione bien.

## 5. Lo que sí se quiere (dirección positiva)

- Estética más cercana a un **flyer de club, un poster de rave, o el diseño de una discoteca real**: colores saturados y contrastantes, tipografía con carácter (condensada, gruesa, con actitud, no genérica), texturas con grano en vez de superficies pulidas y limpias.
- **Animación como parte del lenguaje**, no como decoración encima: transiciones que se sientan como luces que cambian, texto que pulsa como al ritmo de la música, microinteracciones al confirmar asistencia que se sientan como un momento de celebración real (no un simple ✓ verde).
- Componentes propios del dominio: pensar la invitación como una **entrada/ticket/pulsera de acceso**, el panel de admin como algo más parecido a una **consola/mesa de DJ o una lista de puerta de club**, no como un dashboard SaaS genérico.

## 6. Qué se pidió como entregable

1. Una propuesta de `DESIGN.md` completa: paleta, tipografía, principios de movimiento, catálogo de componentes con identidad propia, y un brief específico para alimentar Stitch.
2. Este mismo documento: el pedido original del usuario, reescrito y organizado como un brief de diseño formal, para que quede como referencia de intención y no se pierda en el historial de chat.

## 7. Cómo usar este documento

- Cuando una decisión de diseño esté en duda, la pregunta de referencia es: **"¿esto suena a que voy a salir de carrete esta noche, o suena a que Claude generó otro dashboard?"**. Si la respuesta es lo segundo, se descarta.
- Este documento no se actualiza para reflejar decisiones tomadas durante la implementación (eso vive en `DESIGN.md` y en el código). Se actualiza solo si el usuario cambia o amplía la intención original.

## 8. Addendum — ampliación de alcance: la app es un hub, no solo la invitación

El pedido original de este documento hablaba de la invitación como si fuera toda la superficie del proyecto. El usuario aclaró después que ese no es el límite: la app debe poder escalar como el **punto central para organizar todo el cumpleaños**, no solo la tarjeta de invitación y su RSVP.

Puntos confirmados en esta ampliación:

- La invitación sigue siendo el punto de entrada, pero no el techo del proyecto.
- Se confirman como dirección de producto (detalle en `01-vision-y-requisitos.md` sección 8 y `02-arquitectura-tecnica.md` sección 8):
  - Un **blog/noticias** para avisos y novedades del evento.
  - **Más vistas de administrador** para la organización personal del usuario (logística, presupuesto, y lo que se defina más adelante).
  - Una **galería/momentos**, con una idea concreta que el usuario quiere explorar en una versión más completa: cada invitado tiene un **límite de fotos que puede tomar con un modo cámara dentro de la app** — como una cámara descartable en una fiesta real, no una galería de subida libre.
- Alcance v1 no cambia: sigue siendo invitación + RSVP + admin básico. Lo que cambia es que la arquitectura y el diseño de v1 se construyen ya pensando en este crecimiento, para no tener que reescribir nada cuando se aborde v2.

Este addendum no reemplaza las secciones 1-7 de este documento — el tono "discoteca, no cumpleaños tradicional" y la lista negra de estética de IA siguen aplicando igual a todas las superficies nuevas (blog, galería, admin extendido), no solo a la invitación.

## 9. Addendum 2 — avisos, galería y QR pasan a construirse ahora, con reglas concretas

El addendum de la sección 8 dejaba blog/noticias y galería como "dirección de producto para v2, no se construye ahora". El usuario pidió avanzar esas dos superficies ya, dentro de la app real (no solo como visión documentada), y sumó una tercera que no estaba en ningún documento anterior: un **escáner QR en la puerta**, explícitamente no bloqueante ("las horas no son limitantes, solo 'llegan tarde'", "no es un evento oficial") y con pedido explícito de creatividad ("libérate, agrégale un plus entretenido").

Decisiones tomadas para poder construir esto sin ambigüedad (respuestas del usuario, no inferencias):

- **Avisos**: se construyen ahora como una superficie real (no solo el `AnnouncementTicker` documentado en `DESIGN.md` §7.8 como referencia visual futura — pasa a ser la pantalla/componente real).
- **Fotos — revelado**: el rollo se revela recién **después del evento**, por acción explícita del admin ("revelar el rollo"). Nadie ve fotos de nadie antes de eso, ni siquiera quien las subió — es fiel al concepto de cámara descartable real, no un mural en vivo.
- **Fotos — moderación**: **sí hace falta aprobación del admin** antes de que una foto entre al rollo compartido. Cada foto sube en estado pendiente; el admin la aprueba o la descarta desde `/admin` antes del revelado.
- **QR en la puerta — nivel de realismo**: escaneo **real pero simple**, no teatral. El admin abre la cámara de su celular desde `/admin`, escanea el QR (que codifica el token del invitado — el mismo que ya existe en su `WristbandCard`), y al reconocerlo dispara una animación de bienvenida personalizada (nombre, color según su estado de RSVP) y marca el check-in real en la base. No es teatral con una lista falsa — decodifica un QR de verdad.
- El check-in por QR es explícitamente **no limitante**: no hay una hora de corte que bloquee el ingreso, no reemplaza ni compite con el flujo de RSVP — es una capa festiva adicional en la puerta, no un control de acceso estricto.

Esto no reemplaza el addendum de la sección 8: la galería sigue siendo "cámara in-app con cupo por invitado" tal como se describió ahí (el detalle de "5 fotos" es la primera cifra concreta, no cerrada — el admin puede ajustarla). El detalle técnico de estas tres superficies (modelo de datos, RLS, Storage) vive en `02-arquitectura-tecnica.md` y `03-plan-desarrollo.md`, no en este documento.

## 10. Addendum 3 — pausa para repensar la arquitectura de información y los flujos

Después de que las tres superficies del addendum 2 (avisos, galería, QR) quedaron construidas y en producción, el usuario hizo un walkthrough real de la app y encontró que, aunque cada pieza funciona, el conjunto **no se siente como un flujo único** — quedaron "cosas tiradas por separado". Pidió explícitamente frenar antes de seguir agregando funcionalidad nueva, repensar la arquitectura de información completa, y arrancar ese trabajo en una sesión nueva con los documentos actualizados.

Cuatro problemas concretos que motivaron esto (detalle técnico en `docs/BACKLOG.md`, Etapa 4):

1. El panel de admin no tiene un modo mobile real, pese a que el admin va a operarlo desde el celular la noche del evento.
2. El invitado que ya confirmó no tiene ninguna pista de que la cámara se va a desbloquear después, cuando lo escaneen en la puerta — queda con la sensación de "confirmé y ahora no hay nada más que hacer".
3. Nunca se construyó una vista de "hub" compartida entre invitados (avisos, info del evento, eventualmente el rollo revelado) — todo quedó embebido dentro de la página personal de cada invitado (`/i/{token}`), sin un punto de encuentro común, a pesar de que la visión original (sección 8 de este documento) hablaba explícitamente de un hub.
4. Los toasts de confirmación/error no se cierran solos.

Este addendum no invalida las decisiones de las secciones 8-9 (avisos/galería/QR siguen siendo la dirección de producto correcta) — lo que cambia es que antes de seguir sumando superficies nuevas, hace falta un pase de diseño que conecte las que ya existen en un flujo coherente.
